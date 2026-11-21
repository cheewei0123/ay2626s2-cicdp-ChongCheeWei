import { IsBoolean } from 'class-validator';

// PATCH /api/bills/:id/payments/:participantId: the owner ticks or unticks "paid"
export class MarkPaidDto {
  @IsBoolean({ message: 'paid must be true or false' })
  paid!: boolean;
}
