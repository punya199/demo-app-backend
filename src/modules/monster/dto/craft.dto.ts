import { IsBoolean, IsNotEmpty, IsString, MaxLength } from 'class-validator'

export class StartCraftBodyDto {
  // `${setId}:${slot}`, checked against the recipe list in the service.
  @IsNotEmpty()
  @IsString()
  @MaxLength(64)
  recipeId: string

  @IsBoolean()
  useCatalyst: boolean
}
