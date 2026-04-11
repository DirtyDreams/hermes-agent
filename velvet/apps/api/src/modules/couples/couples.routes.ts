import { FastifyInstance } from 'fastify'
import { createLinkInvite, acceptLinkInvite, getCoupleData } from './couples.service.js'

export default async function (app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.post('/invite', async (request, reply) => {
    const userId = (request.user as any).sub
    try {
      const invite = await createLinkInvite(userId)
      return { inviteToken: invite.inviteToken }
    } catch (err: any) {
      return reply.status(400).send({ message: err.message })
    }
  })

  app.post('/accept', async (request, reply) => {
    const userId = (request.user as any).sub
    const { inviteToken } = request.body as { inviteToken: string }
    
    try {
      const couple = await acceptLinkInvite(userId, inviteToken)
      return { status: 'ok', coupleId: couple.id }
    } catch (err: any) {
      return reply.status(400).send({ message: err.message })
    }
  })

  app.get('/me', async (request, reply) => {
    const userId = (request.user as any).sub
    const couple = await getCoupleData(userId)
    if (!couple) return reply.status(404).send({ message: 'No active couple found' })
    return couple
  })
}
