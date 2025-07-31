import { IsOptional, IsString } from 'class-validator'

export class GetUserOptionsParamsDto {
  @IsString()
  @IsOptional()
  search?: string
}
