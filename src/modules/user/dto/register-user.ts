import { IsString, Matches } from 'class-validator'

export class RegisterUserDto {
  @IsString()
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'username must contain only English letters and numbers',
  })
  username: string

  @IsString()
  password: string
}
