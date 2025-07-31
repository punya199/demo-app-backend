import { RequestMethod } from '@nestjs/common'
import { Params } from 'nestjs-pino'

import { appConfig } from './app-config'

let logLevel = 'debug'

if (appConfig.LOG_LEVEL === 'production') {
  logLevel = 'info'
}

export const pinoConfig: Params = {
  pinoHttp: {
    level: logLevel,
    redact: {
      paths: ['req.body.password', 'req.headers.authorization'],
      censor: '********',
    },
    // serializers: {
    //   req(req) {
    //     req.body = req.raw.body
    //     return req
    //   },
    // },
  },
  exclude: [{ method: RequestMethod.GET, path: 'health' }],
}
