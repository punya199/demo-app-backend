import { IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator'

export class AddLedgerEntryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string

  @IsNotEmpty()
  @IsString()
  item: string

  @IsNumber()
  @Min(0)
  @IsOptional()
  inCash?: number

  @IsNumber()
  @Min(0)
  @IsOptional()
  inBank?: number

  @IsNumber()
  @Min(0)
  @IsOptional()
  outCash?: number

  @IsNumber()
  @Min(0)
  @IsOptional()
  outBank?: number

  @IsString()
  @IsOptional()
  note?: string
}
