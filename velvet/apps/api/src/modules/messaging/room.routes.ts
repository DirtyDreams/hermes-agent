import { FastifyInstance } from 'fastify'
import * as roomService from './room.service.js'

export async function roomRoutes(app: FastifyInstance) {
  app.get('/', async (req) => {
    const userId = (req.user as any).id
    return roomService.getRooms(userId)
  })

  app.post('/', async (req, reply) => {
    const userId = (req.user as any).id
    const { name, type, memberIds } = req.body as any
    // Ensure creator is in memberIds
    const finalMemberIds = Array.from(new Set([userId, ...(memberIds || [])]))
    return roomService.createRoom(name, type || 'SOCIAL_ROOM', finalMemberIds)
  })

  app.get('/:id/messages', async (req) => {
    const userId = (req.user as any).id
    const { id } = req.params as { id: string }
    return roomService.getRoomMessages(id, userId)
  })
}
