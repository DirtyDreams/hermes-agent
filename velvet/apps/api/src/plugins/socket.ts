import fp from 'fastify-plugin'
import { Server, Socket } from 'socket.io'
import { createAdapter } from '@socket.io/redis-adapter'
import { FastifyInstance } from 'fastify'
import { PresenceService } from '../modules/messaging/presence.service.js'

declare module 'fastify' {
  interface FastifyInstance {
    io: Server
  }
}

async function socketPlugin(fastify: FastifyInstance) {
  const io = new Server(fastify.server, {
    cors: {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
      credentials: true,
    },
  })

  // Set up Redis adapter if redis is available
  if (fastify.redis) {
    const pubClient = fastify.redis
    const subClient = pubClient.duplicate()
    io.adapter(createAdapter(pubClient, subClient))
  }

  // set up presence service
  const presenceService = new PresenceService(fastify)

  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token
      if (!token) return next(new Error('Authentication error'))
      
      const payload = await fastify.jwt.verify(token) as { id: string }
      socket.data.userId = payload.id
      next()
    } catch (err) {
      next(new Error('Authentication error'))
    }
  })

  io.on('connection', async (socket: Socket) => {
    const userId = socket.data.userId
    if (!userId) return

    // Mark as online
    await presenceService.updatePresence(userId)
    socket.broadcast.emit('presence:update', { userId, status: 'online' })
    
    // Join a personal room for targeted events (e.g., individual notifications)
    socket.join(`user:${userId}`)

    // Handle heartbeats (to keep presence alive)
    socket.on('heartbeat', async () => {
      await presenceService.updatePresence(userId)
    })

    // Typing Indicators
    socket.on('chat:typing_start', ({ conversationId }) => {
      socket.to(`chat:${conversationId}`).emit('chat:typing', { 
        conversationId, 
        userId, 
        isTyping: true 
      })
    })

    socket.on('chat:typing_stop', ({ conversationId }) => {
      socket.to(`chat:${conversationId}`).emit('chat:typing', { 
        conversationId, 
        userId, 
        isTyping: false 
      })
    })

    // Manual room join for conversations
    socket.on('chat:join', ({ conversationId }) => {
      socket.join(`chat:${conversationId}`)
    })

    socket.on('disconnect', async () => {
      await presenceService.removePresence(userId)
      socket.broadcast.emit('presence:update', { userId, status: 'offline' })
    })
  })

  fastify.decorate('io', io)

  fastify.addHook('onClose', (instance, done) => {
    instance.io.close()
    done()
  })
}

export default fp(socketPlugin)
