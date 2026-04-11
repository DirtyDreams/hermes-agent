import type { FastifyInstance } from 'fastify'
import {
  getConversations,
  getMessages,
  exchangePublicKey,
  unmaskConversation,
} from './messaging.service.js'

export default async function messagingRoutes(app: FastifyInstance) {
  app.get('/', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    return reply.send(await getConversations(request.user.sub))
  })

  app.get('/:id', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const { id } = request.params as { id: string }
    const { cursor } = request.query as { cursor?: string }
    try {
      const messages = await getMessages(id, request.user.sub, cursor)
      return reply.send(messages)
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      throw err
    }
  })

  app.post('/:id/keys', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const { id } = request.params as { id: string }
    const { publicKey } = request.body as { publicKey: string }
    try {
      if (!publicKey) return reply.status(400).send({ status: 'error', message: 'publicKey required' })
      const conversation = await exchangePublicKey(id, request.user.sub, publicKey)
      return reply.send({ keyA: conversation.keyA, keyB: conversation.keyB })
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      throw err
    }
  })

  app.patch('/:id/unmask', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const { id } = request.params as { id: string }
    try {
      const conversation = await unmaskConversation(id, request.user.sub)
      return reply.send({ 
        status: 'success', 
        isUnmaskedA: conversation.isUnmaskedA,
        isUnmaskedB: conversation.isUnmaskedB 
      })
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      throw err
    }
  })
}
