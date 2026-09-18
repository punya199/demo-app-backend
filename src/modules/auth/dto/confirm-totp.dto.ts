import { IsString } from 'class-validator'

export class ConfirmTotpDto {
  @IsString()
  code: string
}
