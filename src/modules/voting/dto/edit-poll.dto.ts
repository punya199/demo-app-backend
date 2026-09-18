import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator'

export class EditPollBodyDto {
  @IsOptional()
  @IsNotEmpty()
  @IsString()
  title?: string

  @IsOptional()
  @IsString()
  description?: string

  // Omit entirely to leave options untouched. Present = "replace the options list" - rejected
  // by the service once the poll has its first vote.
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  options?: string[]
}
