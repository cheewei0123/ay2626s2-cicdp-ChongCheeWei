import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  registerDecorator,
  ValidateNested,
  type ValidationArguments,
} from 'class-validator';
import { formatPercent, type SplitMode } from '../../split/split.service.js';

export const SPLIT_MODES: SplitMode[] = ['EQUAL', 'SHARES', 'PERCENT', 'EXACT'];

// One person's part of the item; which field is used depends on splitMode
export class SplitEntryDto {
  @IsString()
  @IsNotEmpty()
  participantId!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  shares?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  percentBp?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  exactCents?: number;
}

// The field each mode needs from every entry (EQUAL needs none)
const FIELD_FOR: Partial<Record<SplitMode, keyof SplitEntryDto>> = {
  SHARES: 'shares',
  PERCENT: 'percentBp',
  EXACT: 'exactCents',
};

// Custom class-validator rule: checks the entries make sense for the chosen mode,
// so ValidationPipe answers 400 before the request reaches the service.
// (EXACT amounts are checked against the item's price in the service, which knows it.)
export function ValidSplitEntries() {
  return (target: object, propertyName: string) =>
    registerDecorator({
      name: 'validSplitEntries',
      target: target.constructor,
      propertyName,
      validator: {
        validate(entries: unknown, args: ValidationArguments) {
          return splitEntriesProblem(entries, args) === null;
        },
        defaultMessage(args: ValidationArguments) {
          return splitEntriesProblem(args.value, args) ?? '';
        },
      },
    });
}

// Returns what is wrong with the entries, or null if they are fine
export function splitEntriesProblem(
  entries: unknown,
  args: ValidationArguments,
): string | null {
  if (!Array.isArray(entries)) return null; // @IsArray-style checks report this
  const { splitMode } = args.object as { splitMode?: SplitMode };
  const ids = entries.map((e: SplitEntryDto) => e?.participantId);
  if (new Set(ids).size !== ids.length) {
    return 'Each person can only appear once in entries';
  }
  const field = splitMode ? FIELD_FOR[splitMode] : undefined;
  if (!field) return null;
  if (entries.some((e: SplitEntryDto) => e?.[field] === undefined)) {
    return `Every entry needs ${field} when splitMode is ${splitMode}`;
  }
  if (splitMode === 'PERCENT') {
    const sum = entries.reduce(
      (a: number, e: SplitEntryDto) => a + (e.percentBp ?? 0),
      0,
    );
    if (sum !== 10000) {
      return `Percentages add up to ${formatPercent(sum)}, need 100%`;
    }
  }
  return null;
}

// PATCH /api/share/:token/claims/:itemId and PATCH /api/bills/:id/items/:itemId/split
export class SetSplitDto {
  @IsIn(SPLIT_MODES, {
    message: `splitMode must be one of ${SPLIT_MODES.join(', ')}`,
  })
  splitMode!: SplitMode;

  @ValidateNested({ each: true })
  @Type(() => SplitEntryDto)
  @ArrayMinSize(1, { message: 'entries must list everyone on this item' })
  @ValidSplitEntries()
  entries!: SplitEntryDto[];
}
