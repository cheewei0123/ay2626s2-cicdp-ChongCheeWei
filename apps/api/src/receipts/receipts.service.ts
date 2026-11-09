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

    // Suggested charges. Many receipts (fast food, food courts, cafés) have no
    // service charge and GST already inside the total. Compared with the items'
    // sum, because some receipts print no subtotal line.
    const serviceBp =
      receipt.serviceCents === undefined ? 0 : DEFAULT_SERVICE_BP;
    const gstBp =
      receipt.totalCents === itemsSubtotalCents ? 0 : DEFAULT_GST_BP;

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

// null when the receipt doesn't show the number, so there is nothing to compare
function sameOrNull(ours: number, printed: number | null) {
  return printed === null ? null : ours === printed;
}
