import { Hono } from 'hono'
import { getSignedMediaUrl } from '../lib/r2'
import { Env } from '../types'
const media = new Hono<{ Bindings: Env }>()

media.get('/signed-url', async (c) => {
  const key = c.req.query('key')
  if (!key) {
    return c.json({ error: 'key query parameter is required' }, 400)
  }

  // Basic path traversal guard
  if (key.includes('..')) {
    return c.json({ error: 'Invalid key' }, 400)
  }

  const url = await getSignedMediaUrl(c.env, key)
  return c.json({ url })
})

export default media