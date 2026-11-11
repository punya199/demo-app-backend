import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common'
import { AuthUser, ReqUser } from '../../auth/auth.decorator'
import { IAppJwtPayload } from '../../auth/auth.interface'
import { MarketBrowseQueryDto, MarketListBodyDto } from '../dto/market.dto'
import { MarketService } from './market.service'

@Controller('market')
export class MarketController {
  constructor(private readonly marketService: MarketService) {}

  @AuthUser()
  @Get()
  async browse(@Query() query: MarketBrowseQueryDto, @ReqUser() user: IAppJwtPayload) {
    return this.marketService.browse(user['user-id'], query)
  }

  @AuthUser()
  @Get('mine')
  async getMine(@ReqUser() user: IAppJwtPayload) {
    return this.marketService.getMine(user['user-id'])
  }

  @AuthUser()
  @Post('listings')
  async create(@Body() body: MarketListBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.marketService.create(user['user-id'], body.monsterId, body.price)
  }

  @AuthUser()
  @Delete('listings/:listingId')
  async cancel(
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @ReqUser() user: IAppJwtPayload
  ) {
    return this.marketService.cancel(user['user-id'], listingId)
  }

  @AuthUser()
  @Post('listings/:listingId/buy')
  async buy(
    @Param('listingId', new ParseUUIDPipe()) listingId: string,
    @ReqUser() user: IAppJwtPayload
  ) {
    return this.marketService.buy(user['user-id'], listingId)
  }
}
