import { ArgumentsHost, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { randomUUID } from 'crypto'
import { Request, Response } from 'express'

export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const requestId = String(request.headers?.['x-request-id'] ?? randomUUID()).slice(0, 64)
    const responseErrorPayload = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      path: request.url,
      timestamp: new Date().toISOString(),
    }

    if (exception instanceof HttpException) {
      const exceptionResponse = exception.getResponse()
      const isObject = typeof exceptionResponse === 'object'
      if (isObject) {
        for (const [key, value] of Object.entries(exceptionResponse)) {
          responseErrorPayload[key] = value
        }
      }
    }

    logException(exception, request, responseErrorPayload.statusCode, requestId)
    response.status(responseErrorPayload.statusCode).json(responseErrorPayload)
  }
}

// PDPA: log a summary only. Raw exceptions (TypeORM QueryFailedError) carry the SQL text and its
// bound parameters (user ids, battle ids, seeds), so only the name, the message, the status, the
// route path (no query string) and a request id are written. Never log `parameters` or `query`.
function logException(exception: unknown, request: Request, status: number, requestId: string) {
  const error = exception instanceof Error ? exception : undefined
  const summary = {
    requestId,
    status,
    method: request.method,
    path: request.path ?? request.url?.split('?')[0],
    name: error?.name ?? typeof exception,
    message: error?.message,
    // the pg error code (e.g. 23505) is safe and tells a unique violation from a timeout
    code: (error as { driverError?: { code?: string } } | undefined)?.driverError?.code,
    // stacks only for unexpected errors; their first line is the same safe message
    stack: status >= 500 ? error?.stack : undefined,
  }
  console.error(JSON.stringify(summary))
}
