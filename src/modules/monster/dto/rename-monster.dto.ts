import { IsString, IsUUID, MaxLength } from 'class-validator'

export class RenameMonsterBodyDto {
  @IsUUID()
  monsterId: string

  // Empty clears the nickname; the real rules (length, characters) live in monster-name.ts.
  @IsString()
  @MaxLength(64)
  name: string
}
