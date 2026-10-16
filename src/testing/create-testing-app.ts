import { INestApplication, ModuleMetadata } from '@nestjs/common'
import { Test, TestingModuleBuilder } from '@nestjs/testing'
import { Server } from 'http'
import { configureApp } from '../config/app-setup'

export async function createTestingApp(
  metadata: ModuleMetadata,
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = builder => builder
): Promise<INestApplication<Server>> {
  const moduleRef = await customize(Test.createTestingModule(metadata)).compile()
  const app = moduleRef.createNestApplication<INestApplication<Server>>()
  configureApp(app)
  await app.init()
  return app
}
