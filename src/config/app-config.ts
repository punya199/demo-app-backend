import 'dotenv/config'
import Joi from 'joi'

process.env.POSTGRES_DATABASE_VERSION = process.env.AWS_XRAY_POSTGRES_DATABASE_VERSION
process.env.POSTGRES_DRIVER_VERSION = process.env.AWS_XRAY_POSTGRES_DRIVER_VERSION

export const appConfig = {
  DATABASE_HOST: process.env.DATABASE_HOST,
  DATABASE_USER: process.env.DATABASE_USER,
  DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
  DATABASE_NAME: process.env.DATABASE_NAME,
  DATABASE_PORT: +(process.env.DATABASE_PORT || 5432),
  DATABASE_SSL: process.env.DATABASE_SSL === 'true' || false,
}

type IConfigKey = keyof typeof appConfig
type IJoiObject = { [p in IConfigKey]: Joi.Schema<unknown> }

const joiObject: IJoiObject = {
  DATABASE_HOST: Joi.string().required().description('Database host'),
  DATABASE_USER: Joi.string().required().description('Database user'),
  DATABASE_PASSWORD: Joi.string().required().description('Database password'),
  DATABASE_NAME: Joi.string().required().description('Database name'),
  DATABASE_PORT: Joi.number().default(5432).description('Database port'),
  DATABASE_SSL: Joi.boolean().default(false).description('Use SSL for database connection'),
}

export const validationSchema = Joi.object<IJoiObject>(joiObject)

export default appConfig
