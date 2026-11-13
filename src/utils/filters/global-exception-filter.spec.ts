import { ArgumentsHost, BadRequestException, HttpStatus } from '@nestjs/common'
import { QueryFailedError } from 'typeorm'
import { GlobalExceptionFilter } from './global-exception-filter'

const run = (exception: unknown, headers: Record<string, string> = {}) => {
  const json = jest.fn()
  const status = jest.fn(() => ({ json }))
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({
        method: 'POST',
        url: '/api/v1/td/battles/abc/finish?token=secret',
        path: '/api/v1/td/battles/abc/finish',
        headers,
      }),
    }),
  } as unknown as ArgumentsHost
  new GlobalExceptionFilter().catch(exception, host)
  return { status, json }
}

describe('GlobalExceptionFilter', () => {
  let logged: string
  beforeEach(() => {
    logged = ''
    const capture = (...args: unknown[]) => {
      logged += args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')
    }
    jest.spyOn(console, 'log').mockImplementation(capture)
    jest.spyOn(console, 'error').mockImplementation(capture)
    jest.spyOn(console, 'warn').mockImplementation(capture)
  })
  afterEach(() => jest.restoreAllMocks())

  it('never logs SQL parameters, the query text or the query string', () => {
    const error = new QueryFailedError(
      'INSERT INTO td.x (user_id, seed) VALUES ($1, $2)',
      ['user-1234-secret', 987654321],
      new Error('duplicate key value violates unique constraint "uq"')
    )
    const { status } = run(error, { 'x-request-id': 'req-1' })
    expect(status).toHaveBeenCalledWith(500)
    expect(logged).toContain('QueryFailedError')
    expect(logged).toContain('req-1')
    expect(logged).toContain('/api/v1/td/battles/abc/finish')
    for (const leak of ['user-1234-secret', '987654321', 'INSERT INTO', 'token=secret'])
      expect(logged).not.toContain(leak)
  })

  it('keeps the response shape for HttpExceptions', () => {
    const { status, json } = run(new BadRequestException('nope'))
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json).toHaveBeenCalledWith({
      statusCode: 400,
      message: 'nope',
      error: 'Bad Request',
      path: '/api/v1/td/battles/abc/finish?token=secret',
      timestamp: expect.any(String),
    })
  })

  it('keeps the generic 500 payload for unknown errors', () => {
    const { json } = run(new Error('boom'))
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500, message: 'Internal server error' })
    )
  })
})
