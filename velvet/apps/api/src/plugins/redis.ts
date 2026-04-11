import fp from 'fastify-plugin'
import Redis from 'ioredis'
import { FastifyInstance } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis
  }
}

async function redisPlugin(fastify: FastifyInstance) {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

  fastify.decorate('redis', redis)

  fastify.addHook('onClose', async (instance) => {
    await instance.redis.quit()
  })
}

export default fp(redisPlugin)
