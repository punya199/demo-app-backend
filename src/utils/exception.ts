import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common'

interface AppHttpException {
  [p: string]: unknown
  errorCode?: string
}

export class AppValidateException extends HttpException {
  constructor(data?: AppHttpException) {
    super(
      { statusCode: HttpStatus.UNPROCESSABLE_ENTITY, errorCode: '422-002', ...data },
      HttpStatus.OK
    )
  }
}

export class AppBadRequestException extends BadRequestException {
  constructor(data?: AppHttpException) {
    super({ statusCode: HttpStatus.BAD_REQUEST, errorCode: '400-002', ...data })
  }
}

export class AppUnauthorizedException extends UnauthorizedException {
  constructor(data?: AppHttpException) {
    super({ statusCode: HttpStatus.UNAUTHORIZED, errorCode: '401-001', ...data })
  }
}

export class AppForbiddenException extends ForbiddenException {
  constructor(data?: AppHttpException) {
    super({ statusCode: HttpStatus.FORBIDDEN, errorCode: '403-001', ...data })
  }
}

export class AppValidateNotFoundException extends HttpException {
  constructor(data?: AppHttpException) {
    super({ statusCode: HttpStatus.NOT_FOUND, errorCode: '404-001', ...data }, HttpStatus.NOT_FOUND)
  }
}

export class AppUnprocessableEntityException extends UnprocessableEntityException {
  constructor(data?: AppHttpException) {
    super({
      statusCode: HttpStatus.UNPROCESSABLE_ENTITY,
      errorCode: '422-001',
      ...data,
    })
  }
}

export class AppInternalServerErrorException extends InternalServerErrorException {
  constructor(data?: AppHttpException) {
    super({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      errorCode: '500-001',
      ...data,
    })
  }
}
