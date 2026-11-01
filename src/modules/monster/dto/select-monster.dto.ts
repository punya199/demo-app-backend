import { IsNotEmpty, IsUUID } from 'class-validator'

export class SelectMonsterBodyDto {
  @IsNotEmpty()
  @IsUUID()
  monsterId: string
}
