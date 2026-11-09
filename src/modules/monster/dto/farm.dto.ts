import { IsEnum } from 'class-validator'
import { EnumFurnitureKind } from '../farm/farm-data'

export class FarmKindBodyDto {
  @IsEnum(EnumFurnitureKind)
  kind: EnumFurnitureKind
}
