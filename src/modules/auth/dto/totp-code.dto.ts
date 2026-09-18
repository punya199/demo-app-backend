import { IsString } from 'class-validator'

export class TotpCodeDto {
  @IsString()
  code: string
}
