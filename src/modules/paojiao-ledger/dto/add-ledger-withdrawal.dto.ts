import { IsIn, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator'
import { LedgerPerson } from '../paojiao-ledger.interface'

const PEOPLE: LedgerPerson[] = ['น้าปุ้ม', 'ปัญญา']

export class AddLedgerWithdrawalDto {
  @IsIn(PEOPLE)
  who: LedgerPerson

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
