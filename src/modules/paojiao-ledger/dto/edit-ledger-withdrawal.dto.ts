import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator'

// Unlike EditLedgerEntryDto/EditLedgerWageDto, this doesn't extend AddLedgerWithdrawalDto - `who`
// is a path param on the edit route (it picks which column block to write to and can't itself be
// changed by an edit), not a body field.
export class EditLedgerWithdrawalDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string

  @IsNumber()
  @Min(0)
  @IsOptional()
  cash?: number

  @IsNumber()
  @Min(0)
  @IsOptional()
  bank?: number

  @IsString()
  @IsOptional()
  note?: string
}
