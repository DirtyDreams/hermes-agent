import type { FastifyInstance } from 'fastify'
import { SendVibeSchema } from '@velvet/shared'
import { getDiscoveryFeed, sendVibe, getMatches } from './discovery.service.js'

export default async function discoveryRoutes(app: FastifyInstance) {
  app.get('/feed', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const { page, limit, minAge, maxAge, experienceLevel, verificationStatus } = request.query as any
    const feed = await getDiscoveryFeed({
      userId: request.user.sub,
      page: Number(page) || 1,
      limit: Math.min(Number(limit) || 20, 50),
      filters: { 
        minAge: minAge ? Number(minAge) : undefined, 
        maxAge: maxAge ? Number(maxAge) : undefined, 
        experienceLevel, 
        verificationStatus 
      },
    })
    return reply.send(feed)
  })

  app.post('/vibe', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const input = SendVibeSchema.parse(request.body)
      const result = await sendVibe(request.user.sub, input.targetId, input.type)

      // Socket.io integration will follow in Phase 5
      const io = (app as any).io
      if (result.match && io) {
        io.to(request.user.sub).emit('match:new', { matchId: result.match.id })
        io.to(input.targetId).emit('match:new', { matchId: result.match.id })
      }

      return reply.send({ status: 'ok', ...result })
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      if (err.name === 'ZodError') return reply.status(400).send({ status: 'error', errors: err.format() })
      throw err
    }
  })

  app.get('/matches', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const matches = await getMatches(request.user.sub)
    return reply.send(matches)
  })
}
