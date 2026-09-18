import { ArrayMinSize, IsArray, IsUUID } from 'class-validator'

export class SubmitVoteBodyDto {
  // Single/multiple-choice: order doesn't matter. Ranking: order is the preference,
  // most-preferred first - index becomes the option's rank.
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  optionIds: string[]
}
