import { Server as SocketServer } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { redis } from './redis.js'
import { db } from './db.js'
import { saveMessage } from '../modules/messaging/messaging.service.js'
import type { FastifyInstance } from 'fastify'

export async function setupSocketIO(app: FastifyInstance) {
  const pubClient = redis.duplicate()
  const subClient = redis.duplicate()
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

  io.on('connection', (socket) => {
    const userId = (socket as any).userId
    app.log.info({ userId, socketId: socket.id }, 'Socket connected')

    socket.join(userId)

    socket.on('message:send', async (data: { conversationId: string, encryptedContent: string, nonce: string }, callback) => {
      try {
        // 1. Verify user is in conversation
        const conv = await db.conversation.findUnique({
          where: { id: data.conversationId },
          include: { match: true }
        })
        if (!conv) return callback?.({ status: 'error', message: 'Conversation not found' })
        
        const { userAId, userBId } = conv.match
        if (userId !== userAId && userId !== userBId) {
          return callback?.({ status: 'error', message: 'Forbidden' })
        }

        // 2. Save to DB
        const msg = await saveMessage(data.conversationId, userId, data.encryptedContent, data.nonce)

        // 3. Emit to other participant
        const targetId = userId === userAId ? userBId : userAId
        io.to(targetId).emit('message:receive', msg)

        callback?.({ status: 'ok', message: msg })
      } catch (err: any) {
        app.log.error(err)
        callback?.({ status: 'error', message: err.message })
      }
    })

    socket.on('disconnect', () => {
      app.log.info({ userId, socketId: socket.id }, 'Socket disconnected')
    })
  })

  // Decorate app with io for access in routes
  app.decorate('io', io)

  return io
}
