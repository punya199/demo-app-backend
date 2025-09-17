// user.controller.ts
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { UserRole } from '../../db/entities/user.entity'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { EditRoleUserDto } from './dto/edit-role-user'
import { EditUserPermissionsDto } from './dto/edit-user-permissions.dto'
import { GetUserOptionsParamsDto } from './dto/get-user-options.dto'
import { RegisterUserDto } from './dto/register-user'
import { UserService } from './user.service'

@Controller('users')
export class UserController {
  constructor(
    private readonly userService: UserService,
    private readonly dataSource: DataSource
  ) {}

  @AuthUser()
  @Get('me')
  getMe(@ReqUser() user: IAppJwtPayload) {
    return this.userService.getMe(user['user-id'])
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

  @Put(':userId/permissions')
  editUserPermissions(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Body() dto: EditUserPermissionsDto
  ) {
    return this.dataSource.transaction(async etm => {
      return this.userService.editUserPermissions(userId, dto, etm)
    })
  }

  @AuthUser(UserRole.SUPER_ADMIN)
  @Put(':userId')
  editUser(@Param('userId', ParseUUIDPipe) userId: string, @Body() dto: EditRoleUserDto) {
    return this.userService.editRoleUser(userId, dto)
  }

  @Get(':userId/permissions')
  getUserPermissions(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userService.getUserPermissions(userId)
  }

  @Get(':userId')
  getUser(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.userService.getUser(userId)
  }
}
