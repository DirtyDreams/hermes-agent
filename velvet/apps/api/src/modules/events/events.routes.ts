import type { FastifyInstance } from 'fastify'
import { db } from '../../lib/db.js'

export default async function eventRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { city, type, page } = request.query as any
    const skip = ((Number(page) || 1) - 1) * 20

    const events = await db.event.findMany({
      where: {
        status: 'published',
        startDatetime: { gte: new Date() },
        ...(city && { locationCity: { contains: city, mode: 'insensitive' } }),
        ...(type && { eventType: type }),
      },
      orderBy: { startDatetime: 'asc' },
      skip,
      take: 20,
    })

    return reply.send(events)
  })

  app.get('/:id', { onRequest: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string }
    const event = await db.event.findUniqueOrThrow({ where: { id } })
    return reply.send(event)
  })
}
