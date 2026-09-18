import { Body, Controller, Get, Param, Post, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { get } from 'lodash'
import appConfig from '../../config/app-config'
import { EnumCookieKeys } from '../authentication/authentication.constant'
import { SubmitVoteBodyDto } from './dto/submit-vote.dto'
import { VOTING_ANON_COOKIE, VotingService } from './voting.service'

const getCookie = (req: Request, name: string): string | undefined => {
  const value = get(req, ['cookies', name])
  return typeof value === 'string' && value.length ? value : undefined
}

// No guards on this controller - it's the app's one public, unauthenticated surface, reachable
// by anyone with a poll's link. See docs/agents/domain.md / the voting feature spec for why.
@Controller('polls/public')
export class VotingPublicController {
  constructor(private readonly votingService: VotingService) {}

  @Get(':slug')
  async getPoll(@Param('slug') slug: string, @Req() req: Request) {
    const identity = this.votingService.resolveVoterIdentity(
      getCookie(req, EnumCookieKeys.ACCESS_TOKEN),
      getCookie(req, VOTING_ANON_COOKIE)
    )
    return this.votingService.getPublicPoll(slug, identity)
  }

  @Post(':slug/vote')
  async submitVote(
    @Param('slug') slug: string,
    @Body() body: SubmitVoteBodyDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const identity = this.votingService.resolveVoterIdentity(
      getCookie(req, EnumCookieKeys.ACCESS_TOKEN),
      getCookie(req, VOTING_ANON_COOKIE)
    )
    if (identity.newAnonToken) {
      res.cookie(VOTING_ANON_COOKIE, identity.newAnonToken, {
        httpOnly: appConfig.COOKIE_HTTP_ONLY,
        secure: appConfig.COOKIE_SECURE,
        sameSite: appConfig.COOKIE_SAME_SITE,
        maxAge: 365 * 24 * 60 * 60 * 1000,
      })
    }
    return this.votingService.submitVote(slug, body, identity)
  }
}
