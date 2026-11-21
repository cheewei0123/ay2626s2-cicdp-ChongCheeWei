import { Body, Controller, Param, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  BillOwnerGuard,
  type OwnedBill as OwnedBillType,
} from '../bills/guards/bill-owner.guard.js';
import { OwnedBill } from '../bills/guards/owned-bill.decorator.js';
import { MarkPaidDto } from './dto/mark-paid.dto.js';
import { PaymentsService } from './payments.service.js';

// Only the bill's owner: 401 without a login, 403 for someone else's bill, 404 if it doesn't exist
@UseGuards(JwtAuthGuard, BillOwnerGuard)
@Controller('bills/:id/payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  // PATCH /api/bills/:id/payments/:participantId { paid } → 200; 409 while the bill is OPEN
  @Patch(':participantId')
  markPaid(
    @OwnedBill() bill: OwnedBillType,
    @Param('participantId') participantId: string,
    @Body() dto: MarkPaidDto,
  ) {
    return this.payments.markPaid(bill, participantId, dto.paid);
  }
}
