import { Body, Controller, Post, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { DataSource } from 'typeorm'
import { EnumCookieKeys } from '../authentication/authentication.constant'
import { AuthenticationService } from '../authentication/authentication.service'
import { LoginDto } from '../user/dto/login.dto'
import { AuthUser, RefreshTokenAuthGuard } from './auth.decorator'
import { AuthService } from './auth.service'

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly db: DataSource,
    private readonly authenticationService: AuthenticationService
  ) {}

  @Post('login')
  async azureAdSignIn(@Body() body: LoginDto, @Res() res: Response) {
    const result = await this.authService.login(body)
    this.authenticationService.setCookie(res, EnumCookieKeys.ACCESS_TOKEN, result.accessToken)
    this.authenticationService.setCookie(res, EnumCookieKeys.REFRESH_TOKEN, result.refreshToken)
    res.send({
      user: result.user,
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
    await this.authenticationService.refreshToken(req, res)

    res.send({
      status: 'success',
    })
  }
}
