import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import jwt from '@fastify/jwt'
import rateLimit from '@fastify/rate-limit'
import { authenticate } from './plugins/authenticate.js'

export function buildApp() {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  })

  // Plugins
  app.register(cors, {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })

  app.register(cookie, {
    secret: process.env.REFRESH_TOKEN_SECRET || 'dev-refresh-secret',
  })

  app.register(jwt, {
    secret: process.env.JWT_SECRET || 'dev-jwt-secret',
    sign: { expiresIn: process.env.JWT_EXPIRES_IN || '15m' },
  })

  app.register(rateLimit, {
    global: true,
    max: 100,
    timeWindow: '1 minute',
  })

  app.register(authenticate)

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }))

  // Routes
  app.register(import('./modules/auth/auth.routes.js'), { prefix: '/api/v1/auth' })
  app.register(import('./modules/profiles/profiles.routes.js'), { prefix: '/api/v1/profiles' })
  app.register(import('./modules/discovery/discovery.routes.js'), { prefix: '/api/v1/discovery' })
  app.register(import('./modules/messaging/messaging.routes.js'), { prefix: '/api/v1/conversations' })

  return app
}
