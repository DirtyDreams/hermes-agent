import type { FastifyInstance } from 'fastify'
import { db } from '../../lib/db.js'

export default async function userRoutes(app: FastifyInstance) {
  app.get('/me', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const user = await db.user.findUniqueOrThrow({
      where: { id: request.user.sub },
      select: {
        id: true,
        isEmailVerified: true,
        isPhoneVerified: true,
        createdAt: true,
        profile: {
          include: { 
            photos: {
              orderBy: { order: 'asc' }
            } 
          },
        },
      },
    })
    return reply.send(user)
  })

  // GDPR account deletion: soft-delete immediately, wipe after 30 days
  app.delete('/me', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user.sub
    await db.user.update({
      where: { id: userId },
      data: {
        isActive: false,
        deletedAt: new Date(),
        // Anonymize PII immediately
        emailHash: `deleted_${userId}`,
        passwordHash: 'deleted',
      },
    })
    // Profile hidden
    await db.profile.update({
      where: { userId },
      data: { isVisible: false },
    })
    return reply.send({ message: 'Account scheduled for deletion in 30 days' })
  })
}
