import { IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class AddLedgerItemDto {
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  name: string
}
