import { IsNotEmpty, IsUUID } from 'class-validator'

export class ReturnHomeBodyDto {
  @IsNotEmpty()
  @IsUUID()
  monsterId: string
}
