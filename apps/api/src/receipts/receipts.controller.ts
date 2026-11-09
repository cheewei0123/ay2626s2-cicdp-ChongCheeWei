import {
  Controller,
  FileTypeValidator,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  BillOwnerGuard,
  type OwnedBill as OwnedBillType,
} from '../bills/guards/bill-owner.guard.js';
import { OwnedBill } from '../bills/guards/owned-bill.decorator.js';
import { ReceiptsService } from './receipts.service.js';

const MAX_BYTES = 5 * 1024 * 1024;

@UseGuards(JwtAuthGuard, BillOwnerGuard)
@Controller('bills/:id/receipt')
export class ReceiptsController {
  constructor(private readonly receipts: ReceiptsService) {}

  // POST /api/bills/:id/receipt (multipart, field "image") → a draft for the owner to check
  @Post()
  // Same as Gemini's free limit, so users hit our clear 429 before Google's
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  // Multer stops reading at 5 MB and answers 413, so a huge upload never fills memory
  @UseInterceptors(
    FileInterceptor('image', { limits: { fileSize: MAX_BYTES } }),
  )
  read(
    @OwnedBill() bill: OwnedBillType,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new FileTypeValidator({ fileType: /^image\/(jpeg|png)$/ }),
        ],
      }),
    )
    image: { buffer: Buffer; mimetype: string }, // the parts of Multer's file we use
  ) {
    return this.receipts.draftFromPhoto(bill, image.buffer, image.mimetype);
  }
}
