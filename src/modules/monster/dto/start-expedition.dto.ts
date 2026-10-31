import { IsNotEmpty, IsString } from 'class-validator'

export class StartExpeditionBodyDto {
  @IsNotEmpty()
  @IsString()
  areaId: string
}
