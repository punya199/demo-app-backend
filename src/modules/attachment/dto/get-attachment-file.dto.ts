import { Transform } from 'class-transformer'
import { IsBoolean, IsOptional } from 'class-validator'

export class GetAttachmentFileParamsDto {
  @IsBoolean()
  @Transform(({ value }) => value === 'true')
  @IsOptional()
  thumbnail?: boolean = false
}
