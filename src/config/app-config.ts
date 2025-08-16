import 'dotenv/config'
import Joi from 'joi'

export const ALLOW_LOG_LEVEL = ['debug', 'production'] as const

export const appConfig = {
  PORT: process.env.PORT || 3000,
  LOG_LEVEL: process.env.LOG_LEVEL as (typeof ALLOW_LOG_LEVEL)[number],
  IS_WORKER: process.env.IS_WORKER === 'true',
  APP_VERSION: process.env.APP_VERSION ?? '',
  APP_BUILD_VERSION: process.env.APP_BUILD_VERSION ?? '',

  JWT_SECRET: process.env.JWT_SECRET ?? '',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN ?? '',

  DATABASE_HOST: process.env.DATABASE_HOST,
  DATABASE_USER: process.env.DATABASE_USER,
  DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
  DATABASE_NAME: process.env.DATABASE_NAME,
  DATABASE_PORT: +(process.env.DATABASE_PORT || 5432),
  DATABASE_SSL: process.env.DATABASE_SSL === 'true' || false,

  AWS_ENDPOINT: process.env.AWS_ENDPOINT ?? '',
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? '',
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? '',
  AWS_BUCKET_NAME: process.env.AWS_BUCKET_NAME ?? '',
  AWS_REGION: process.env.AWS_REGION ?? '',
}

type IConfigKey = keyof typeof appConfig
type IJoiObject = { [p in IConfigKey]: Joi.Schema<unknown> }

const joiObject: IJoiObject = {
  PORT: Joi.number().default(3000).description('Port'),
  LOG_LEVEL: Joi.string()
    .valid(...ALLOW_LOG_LEVEL)
    .description('Log level'),

  APP_VERSION: Joi.string().allow(null, '').optional().description('App version'),
  APP_BUILD_VERSION: Joi.string().allow(null, '').optional().description('App build version'),
  IS_WORKER: Joi.optional().description('Is worker'),

  JWT_SECRET: Joi.string().required().description('JWT secret'),
  JWT_EXPIRES_IN: Joi.string().required().description('JWT expires in'),

  DATABASE_HOST: Joi.string().required().description('Database host'),
  DATABASE_USER: Joi.string().required().description('Database user'),
  DATABASE_PASSWORD: Joi.string().required().description('Database password'),
  DATABASE_NAME: Joi.string().required().description('Database name'),
  DATABASE_PORT: Joi.number().default(5432).description('Database port'),
  DATABASE_SSL: Joi.boolean().default(false).description('Use SSL for database connection'),

  AWS_ENDPOINT: Joi.string().required().description('AWS endpoint'),
  AWS_ACCESS_KEY_ID: Joi.string().required().description('AWS access key ID'),
  AWS_SECRET_ACCESS_KEY: Joi.string().required().description('AWS secret access key'),
  AWS_BUCKET_NAME: Joi.string().required().description('AWS bucket name'),
  AWS_REGION: Joi.string().required().description('AWS region'),
}

export const validationSchema = Joi.object<IJoiObject>(joiObject)

export default appConfig
