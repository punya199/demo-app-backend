import { json, urlencoded } from 'express'

// A td replay log is at most ~100 KB (2000 inputs); the global 50mb limit is far too loose for it.
const TD_FINISH_PATH = '/api/v1/td/battles/:id/finish'
const TD_FINISH_BODY_LIMIT = '128kb'

// The finish route's parser must come first: body-parser skips a body that is already parsed, so
// the route is rejected with 413 before the 50mb global parser (or the ValidationPipe) sees it.
export function useBodyParsers(app: { use: (...args: any[]) => unknown }) {
  app.use(TD_FINISH_PATH, json({ limit: TD_FINISH_BODY_LIMIT }))
  app.use(json({ limit: '50mb' }))
  app.use(urlencoded({ limit: '50mb', extended: true }))
}
