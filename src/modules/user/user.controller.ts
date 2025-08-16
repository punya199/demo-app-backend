// user.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common'
import { UserRole } from '../../db/entities/user.entity'
import { EditRoleUserDto } from './dto/edit-role-user'
import { GetUserOptionsParamsDto } from './dto/get-user-options.dto'
import { LoginDto } from './dto/login.dto'
import { RegisterUserDto } from './dto/register-user'
import { PayloadUser } from './jwt.strategy'
import { AuthUser, ReqUser } from './user.decorator'
import { UserService } from './user.service'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.userService.login(dto)
  }

  @AuthUser()
  @Get('me')
  getMe(@ReqUser() user: PayloadUser) {
    return this.userService.getMe(user.userId)
  }

  @Get('options')
  getUserOptions(@Query() params: GetUserOptionsParamsDto) {
    return this.userService.getUserOptions(params)
  }

  @AuthUser(UserRole.ADMIN)
  @Get()
  getUsers() {
    return this.userService.getUsers()
  }

  @Post('register')
  registerUser(@Body() dto: RegisterUserDto) {
    return this.userService.registerUser(dto)
  }

  @AuthUser(UserRole.SUPER_ADMIN)
  @Put(':userId')
  editUser(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: EditRoleUserDto) {
    return this.userService.editRoleUser(userId, dto)
  }
}
