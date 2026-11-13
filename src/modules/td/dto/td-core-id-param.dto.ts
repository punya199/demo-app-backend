import { IsUUID } from 'class-validator'

export class TdCoreIdParamDto {
  @IsUUID()
  id: string
}
