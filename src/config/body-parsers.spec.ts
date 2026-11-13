import express from 'express'
import request from 'supertest'
import { useBodyParsers } from './body-parsers'

const FINISH = '/api/v1/td/battles/6f1b1b8e-0000-4000-8000-000000000000/finish'

describe('useBodyParsers', () => {
  const app = express()
  useBodyParsers(app)
  app.use((_req, res) => res.json({ ok: true }))

  it('rejects an oversized body on the td finish route with 413', async () => {
    const big = { inputs: new Array(100_000).fill({ tick: 0, type: 'pick' }) }
    await request(app).post(FINISH).send(big).expect(413)
  })

  it('accepts a normal finish body', async () => {
    await request(app).post(FINISH).send({ seed: 1, ticks: 10, inputs: [] }).expect(200)
  })

  it('keeps the large global limit for other routes', async () => {
    const big = { data: 'x'.repeat(1024 * 1024) }
    await request(app).post('/api/v1/other').send(big).expect(200)
  })
})
