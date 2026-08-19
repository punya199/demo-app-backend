import { IsNumber, Matches, Min } from 'class-validator'

export class AddLedgerWageDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string

  @IsNumber()
  @Min(0)
  amount: number
}
