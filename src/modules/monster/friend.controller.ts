import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common'
import { AuthUser, ReqUser } from '../auth/auth.decorator'
import { IAppJwtPayload } from '../auth/auth.interface'
import { FriendGiftBodyDto, FriendRequestBodyDto, FriendRespondBodyDto } from './dto/social.dto'
import { FriendService } from './friend.service'

@Controller('friends')
export class FriendController {
  constructor(private readonly friendService: FriendService) {}

  @AuthUser()
  @Get()
  async list(@ReqUser() user: IAppJwtPayload) {
    return this.friendService.list(user['user-id'])
  }

  @AuthUser()
  @Post('request')
  async request(@Body() body: FriendRequestBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.friendService.request(user['user-id'], body.friendCode)
  }

  @AuthUser()
  @Post('respond')
  async respond(@Body() body: FriendRespondBodyDto, @ReqUser() user: IAppJwtPayload) {
    return this.friendService.respond(user['user-id'], body.relationId, body.accept)
  }

  @AuthUser()
  @Delete(':relationId')
  async remove(
    @Param('relationId', new ParseUUIDPipe()) relationId: string,
    @ReqUser() user: IAppJwtPayload
  ) {
    return this.friendService.remove(user['user-id'], relationId)
  }

  @AuthUser()
  @Get(':relationId/visit')
  async visit(
    @Param('relationId', new ParseUUIDPipe()) relationId: string,
    @ReqUser() user: IAppJwtPayload
  ) {
    return this.friendService.visit(user['user-id'], relationId)
  }

  @AuthUser()
  @Post(':relationId/greet')
  async greet(
    @Param('relationId', new ParseUUIDPipe()) relationId: string,
    @ReqUser() user: IAppJwtPayload
  ) {
    return this.friendService.greet(user['user-id'], relationId)
  }

  @AuthUser()
  @Post(':relationId/gift')
  async gift(
    @Param('relationId', new ParseUUIDPipe()) relationId: string,
    @Body() body: FriendGiftBodyDto,
    @ReqUser() user: IAppJwtPayload
  ) {
    return this.friendService.gift(user['user-id'], relationId, body.itemId)
  }
}
