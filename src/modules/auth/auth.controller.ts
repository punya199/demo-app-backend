import { Body, Controller, Post, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { DataSource } from 'typeorm'
import { AppBadRequestException } from '../../utils/exception'
import { EnumCookieKeys } from '../authentication/authentication.constant'
import { AuthenticationService } from '../authentication/authentication.service'
import { LoginDto } from '../user/dto/login.dto'
import {
  AuthUser,
  ReqTwoFactorPendingUserId,
  ReqUser,
  RefreshTokenAuthGuard,
  TwoFactorPendingAuthGuard,
} from './auth.decorator'
import { AuthService, REMEMBER_DEVICE_MAX_AGE_MS } from './auth.service'
import { TotpCodeDto } from './dto/totp-code.dto'
import { IAppJwtPayload } from './auth.interface'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly db: DataSource,
    private readonly authenticationService: AuthenticationService
  ) {}

  @Post('login')
  async azureAdSignIn(@Body() body: LoginDto, @Req() req: Request, @Res() res: Response) {
    const rememberDeviceToken = req.cookies?.[EnumCookieKeys.REMEMBER_DEVICE] as string | undefined
    const result = await this.authService.login(body, rememberDeviceToken)

    if (result.twoFactorRequired) {
      res.send({ twoFactorRequired: true, pendingToken: result.pendingToken })
      return
    }

    this.authenticationService.setCookie(res, EnumCookieKeys.ACCESS_TOKEN, result.accessToken)
    this.authenticationService.setCookie(res, EnumCookieKeys.REFRESH_TOKEN, result.refreshToken)
    res.send({
      user: result.user,
      refreshToken: result.refreshToken,
    })
  }

  @AuthUser()
  @Post('logout')
  async signOut(@Req() req: Request, @Res() res: Response) {
    await this.authenticationService.clearToken(req, res)

    res.send({
      status: 'success',
    })
  }

  @RefreshTokenAuthGuard()
  @Post('refresh-token')
  async refreshToken(@Req() req: Request, @Res() res: Response) {
    const result = await this.authenticationService.refreshToken(req, res)
    if (!result) {
      throw new AppBadRequestException({ code: 'AUT4005' })
    }

    res.send({
      refreshToken: result.refreshToken,
    })
  }

  @AuthUser()
  @Post('2fa/enroll')
  async startTwoFactorEnrollment(@ReqUser() user: IAppJwtPayload) {
    return this.authService.startTwoFactorEnrollment(user['user-id'], user.username)
  }

  @AuthUser()
  @Post('2fa/confirm')
  async confirmTwoFactorEnrollment(@ReqUser() user: IAppJwtPayload, @Body() body: TotpCodeDto) {
    return this.authService.confirmTwoFactorEnrollment(user['user-id'], body.code)
  }

  @TwoFactorPendingAuthGuard()
  @Post('2fa/verify')
  async verifyTwoFactor(
    @ReqTwoFactorPendingUserId() userId: string,
    @Body() body: TotpCodeDto,
    @Res() res: Response
  ) {
    const result = await this.authService.completeTwoFactorLogin(userId, body.code)
    this.authenticationService.setCookie(res, EnumCookieKeys.ACCESS_TOKEN, result.accessToken)
    this.authenticationService.setCookie(res, EnumCookieKeys.REFRESH_TOKEN, result.refreshToken)
    this.authenticationService.setCookie(
      res,
      EnumCookieKeys.REMEMBER_DEVICE,
      result.rememberDeviceToken,
      { maxAge: REMEMBER_DEVICE_MAX_AGE_MS }
    )
    res.send({
      user: result.user,
      refreshToken: result.refreshToken,
    })
  }

  @AuthUser()
  @Post('2fa/disable')
  async disableTwoFactor(@ReqUser() user: IAppJwtPayload, @Body() body: TotpCodeDto) {
    await this.authService.disableTwoFactor(user['user-id'], body.code)
    return { status: 'success' }
  }
}
