import { Controller, Get } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { WalletService } from './wallet.service'

@Controller('wallet')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @AuthUser()
  @Get()
  async getMyWallet(@ReqUser() user: IAppJwtPayload) {
    return this.walletService.getBalance(user['user-id'])
  }
}
