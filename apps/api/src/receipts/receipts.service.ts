import { Inject, Injectable } from '@nestjs/common';
import { assertOpen } from '../bills/bill-status.js';
import type { OwnedBill } from '../bills/guards/bill-owner.guard.js';
import type { Prisma } from '../generated/prisma/client.js';
import { OCR_SERVICE, type OcrService } from '../ocr/ocr.interface.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { billTotals } from '../split/money.js';

// The defaults every new bill starts with (10% service, 9% GST)
const DEFAULT_SERVICE_BP = 1000;
const DEFAULT_GST_BP = 900;

@Injectable()
export class ReceiptsService {
  constructor(
    private readonly prisma: PrismaService,
    // Fake, Gemini or Tesseract: this class never knows which
    @Inject(OCR_SERVICE) private readonly ocr: OcrService,
  ) {}

  // Reads a receipt photo and returns a DRAFT. Nothing on the bill changes:
  // the owner checks and edits the items, then saves them with POST /items.
  async draftFromPhoto(bill: OwnedBill, image: Buffer, mimeType: string) {
    assertOpen(bill); // before calling the AI, so a locked bill uses no free quota
    const { raw, items, ...receipt } = await this.ocr.extract(image, mimeType);

    // Keep what the AI answered, to debug a bad read later (the photo is not kept)
    await this.prisma.receiptImage.create({
      data: {
        billId: bill.id,
        ocrProvider: this.ocr.provider,
        rawJson: raw as Prisma.InputJsonValue,
      },
    });

    const itemsSubtotalCents = items.reduce(
      (sum, i) => sum + i.unitPriceCents * i.quantity,
      0,
    );

    const { serviceBp, gstBp } = suggestCharges(
      receipt.subtotalCents ?? itemsSubtotalCents,
      receipt,
    );

    // Two checks for the owner: items vs the printed subtotal (a misread line),
    // and our computed total vs the printed total (wrong service or GST)
    const totalCents = billTotals(itemsSubtotalCents, serviceBp, gstBp).total;
    const receiptSubtotalCents = receipt.subtotalCents ?? null;
    const receiptTotalCents = receipt.totalCents ?? null;
    return {
      receipt,
      items,
      serviceBp,
      gstBp,
      check: {
        itemsSubtotalCents,
        receiptSubtotalCents,
        subtotalMatches: sameOrNull(itemsSubtotalCents, receiptSubtotalCents),
        totalCents,
        receiptTotalCents,
        totalMatches: sameOrNull(totalCents, receiptTotalCents),
      },
    };
  }
}

// The 4 ways a receipt adds charges, fewest first, so a tie picks fewer charges
const CHOICES = [
  { serviceBp: 0, gstBp: 0 },
  { serviceBp: 0, gstBp: DEFAULT_GST_BP },
  { serviceBp: DEFAULT_SERVICE_BP, gstBp: 0 },
  { serviceBp: DEFAULT_SERVICE_BP, gstBp: DEFAULT_GST_BP },
];

// Which charges to tick after a scan (KAN-98). Many receipts (fast food, food
// courts, cafés) already have GST inside their prices, so GST is only ticked when
// adding it is what makes the printed total. The choice whose total is closest
// wins, so a misread item a few cents off doesn't switch GST on.
// No printed total: nothing to compare, so only a printed service charge line is
// ticked; GST stays off for the owner to tick (a "GST" line may be "GST incl.").
export function suggestCharges(
  subtotalCents: number,
  receipt: { serviceCents?: number; totalCents?: number },
) {
  const printed = receipt.totalCents;
  if (printed === undefined) {
    return {
      serviceBp: receipt.serviceCents ? DEFAULT_SERVICE_BP : 0,
      gstBp: 0,
    };
  }
  const off = (c: (typeof CHOICES)[number]) =>
    Math.abs(billTotals(subtotalCents, c.serviceBp, c.gstBp).total - printed);
  return CHOICES.reduce((best, c) => (off(c) < off(best) ? c : best));
}

// null when the receipt doesn't show the number, so there is nothing to compare
function sameOrNull(ours: number, printed: number | null) {
  return printed === null ? null : ours === printed;
}
