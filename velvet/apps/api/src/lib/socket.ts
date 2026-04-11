import { Server as SocketServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { redis } from './redis.js'
import { db } from './db.js'
import { saveMessage } from '../modules/messaging/messaging.service.js'
import { presenceService } from '../modules/presence/presence.service.js'
import Redis from 'ioredis'
import type { FastifyInstance } from 'fastify'

export async function setupSocketIO(app: FastifyInstance) {
  const pubClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true
  })
  const subClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    lazyConnect: true
  })
  await Promise.all([pubClient.connect(), subClient.connect()])

  const io = new SocketServer(app.server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
    adapter: createAdapter(pubClient, subClient),
  })

  // Authenticate socket connections
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers['authorization']?.split(' ')[1]
      if (!token) return next(new Error('Authentication error'))

      const decoded = await app.jwt.verify(token) as { sub: string }
      (socket as any).userId = decoded.sub
      next()
    } catch (err) {
      next(new Error('Authentication error'))
    }
  })

  io.on('connection', async (socket) => {
    const userId = (socket as any).userId
    app.log.info({ userId, socketId: socket.id }, 'Socket connected')

    socket.join(userId)
    await presenceService.setUserOnline(userId)
    io.emit('presence:update', { userId, status: 'online' })

    socket.on('message:send', async (data: { 
      conversationId?: string, 
      roomId?: string,
      encryptedContent: string, 
      nonce: string, 
      contentType?: string,
      isEphemeral?: boolean,
      expiresAt?: string
    }, callback) => {
      try {
        let recipientIds: string[] = []

        // 1. Context validation
        if (data.conversationId) {
          const conv = await db.conversation.findUnique({
            where: { id: data.conversationId },
            include: { match: true }
          })
          if (!conv) return callback?.({ status: 'error', message: 'Conversation not found' })
          const { userAId, userBId } = conv.match
          if (userId !== userAId && userId !== userBId) return callback?.({ status: 'error', message: 'Forbidden' })
          recipientIds = [userId === userAId ? userBId : userAId]
        } else if (data.roomId) {
          const room = await db.room.findUnique({
            where: { id: data.roomId },
            include: { members: true }
          })
          if (!room) return callback?.({ status: 'error', message: 'Room not found' })
          if (!room.members.some(m => m.userId === userId)) return callback?.({ status: 'error', message: 'Forbidden' })
          recipientIds = room.members.map(m => m.userId).filter(id => id !== userId)
        } else {
          return callback?.({ status: 'error', message: 'No target (conversation or room)' })
        }

        // 2. Save to DB
        const msg = await saveMessage(
          data.conversationId, 
          userId, 
          data.encryptedContent, 
          data.nonce, 
          data.contentType || 'text',
          data.isEphemeral || false,
          data.expiresAt ? new Date(data.expiresAt) : undefined,
          data.roomId
        )

        // 3. Broadcast to recipients
        recipientIds.forEach(id => {
          io.to(id).emit('message:receive', msg)
        })

        callback?.({ status: 'ok', message: msg })
      } catch (err: any) {
        app.log.error(err)
        callback?.({ status: 'error', message: err.message })
      }
    })

    socket.on('chat:typing_start', (data: { conversationId?: string, roomId?: string }) => {
      const targetId = data.roomId || data.conversationId
      if (targetId) {
        socket.to(targetId).emit('chat:typing_start', { userId, ...data })
      }
    })

    socket.on('chat:typing_stop', (data: { conversationId?: string, roomId?: string }) => {
      const targetId = data.roomId || data.conversationId
      if (targetId) {
        socket.to(targetId).emit('chat:typing_stop', { userId, ...data })
      }
    })

    socket.on('heartbeat', async () => {
      await presenceService.setUserOnline(userId)
    })

    socket.on('shout:post', async (data: { content: string }) => {
      // Broadcast to everyone for the global board
      io.emit('shout:new', {
        id: Math.random().toString(36).substr(2, 9),
        content: data.content,
        userId: userId,
        nickname: 'Anonymous', // In production we'd fetch from DB
        timestamp: new Date().toISOString()
      })
    })

    socket.on('disconnect', async () => {
      await presenceService.setUserOffline(userId)
      io.emit('presence:update', { userId, status: 'offline' })
      app.log.info({ userId, socketId: socket.id }, 'Socket disconnected')
    })
  })

  // Decorate app with io for access in routes
  app.decorate('io', io)

  return io
}
