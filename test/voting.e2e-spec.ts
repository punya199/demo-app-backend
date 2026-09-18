import { INestApplication, ValidationPipe } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { DataSource, EntityManager } from 'typeorm'
import request from 'supertest'
import { JwtAccessTokenAuthGuard } from '../src/modules/authentication/guard/jwt-access-token-auth.guard'
import { PermissionGuard } from '../src/modules/auth/permission.guard'
import { EnumPollType } from '../src/db/entities/poll.entity'
import { VotingController } from '../src/modules/voting/voting.controller'
import { VotingService } from '../src/modules/voting/voting.service'

// Regression test for the bug where POST /polls threw
// "params.closesAt.getTime is not a function": the global ValidationPipe
// was missing `transform: true`, so class-transformer's @Type(() => Date)
// on CreatePollBodyDto.closesAt never ran and the handler received a raw
// string instead of a Date. This exercises the real HTTP -> ValidationPipe
// -> controller path (the layer that broke), not just the service in isolation.
describe('VotingController (e2e)', () => {
  let app: INestApplication
  let createPoll: jest.Mock

  beforeAll(async () => {
    createPoll = jest.fn().mockResolvedValue({ poll: {} })

    const moduleRef = await Test.createTestingModule({
      controllers: [VotingController],
      providers: [
        { provide: VotingService, useValue: { createPoll } },
        {
          provide: DataSource,
          useValue: {
            transaction: (fn: (etm: EntityManager) => unknown) => fn({} as EntityManager),
          },
        },
      ],
    })
      .overrideGuard(JwtAccessTokenAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(PermissionGuard)
      .useValue({ canActivate: () => true })
      .compile()

    app = moduleRef.createNestApplication()
    app.useGlobalPipes(new ValidationPipe({ transform: true }))
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it('transforms closesAt into a real Date before it reaches the service', async () => {
    const closesAt = new Date(Date.now() + 60_000).toISOString()

    await request(app.getHttpServer())
      .post('/polls')
      .send({
        title: 'Lunch spot',
        pollType: EnumPollType.SINGLE,
        options: ['Pizza', 'Sushi'],
        closesAt,
      })
      .expect(201)

    const params = createPoll.mock.calls[0][0]
    expect(params.closesAt).toBeInstanceOf(Date)
    expect(params.closesAt.getTime()).toBe(new Date(closesAt).getTime())
  })
})
