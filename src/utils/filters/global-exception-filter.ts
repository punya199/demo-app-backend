import { ArgumentsHost, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common'
import { Request, Response } from 'express'

export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    console.log(exception)
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
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

    response.status(responseErrorPayload.statusCode).json(responseErrorPayload)
  }
}
