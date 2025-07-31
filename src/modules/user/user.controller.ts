// user.controller.ts
import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common'
import { GetUserOptionsParamsDto } from './dto/get-user-options.dto'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './jwt-auth.guard'
import { PayloadUser } from './jwt.strategy'
import { ReqUser } from './user.decorator'
import { UserService } from './user.service'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.userService.login(dto)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@ReqUser() user: PayloadUser) {
    return this.userService.getMe(user.userId)
  }

  @Get('options')
  getUserOptions(@Query() params: GetUserOptionsParamsDto) {
    return this.userService.getUserOptions(params)
  }
}
