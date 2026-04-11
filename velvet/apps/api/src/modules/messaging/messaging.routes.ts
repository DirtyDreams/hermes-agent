import type { FastifyInstance } from 'fastify'
import {
  getConversations,
  getMessages,
  exchangePublicKey,
  unmaskConversation,
  saveMessage,
  markAsRead,
} from './messaging.service.js'
import { PresenceService } from './presence.service.js'

export default async function messagingRoutes(app: FastifyInstance) {
  const presenceService = new PresenceService(app)

  app.get('/', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const userId = request.user.sub
    const conversations: any = await getConversations(userId)
    
    // Extract other user IDs to check presence
    const otherUserIds = conversations.map((conv: any) => 
      conv.match.userAId === userId ? conv.match.userBId : conv.match.userAId
    )
    
    const presenceMap = await presenceService.getPresenceMulti(otherUserIds)
    
    // Enrich conversations with presence
    const enriched = conversations.map((conv: any) => {
      const otherId = conv.match.userAId === userId ? conv.match.userBId : conv.match.userAId
      return {
        ...conv,
        otherUser: {
          id: otherId,
          isOnline: presenceMap[otherId] || false
        }
      }
    })

    return reply.send(enriched)
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

  app.post('/:id/messages', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const { id } = request.params as { id: string }
    const { content, nonce, contentType } = request.body as { content: string, nonce: string, contentType?: string }
    
    try {
      const message = await saveMessage(id, request.user.sub, content, nonce, contentType)
      
      // Notify other participants via Socket.io if available
      if (app.io) {
        // We'd find the other participant and emit to their room
        // This is partially handled by the socket:send event in socket.ts
      }

      return reply.send(message)
    } catch (err: any) {
      return reply.status(500).send({ status: 'error', message: err.message })
    }
  })

  app.post('/:id/read', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const { id } = request.params as { id: string }
    await markAsRead(id, request.user.sub)
    return reply.send({ status: 'success' })
  })
}
