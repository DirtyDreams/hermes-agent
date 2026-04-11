import { db } from '../../lib/db.js'

export async function createRoom(name: string, type: 'MATCH_GROUP' | 'SOCIAL_ROOM', memberIds: string[]) {
  const room = await db.room.create({
    data: {
      name,
      type,
      members: {
        create: memberIds.map(userId => ({
          userId,
          role: type === 'SOCIAL_ROOM' && memberIds[0] === userId ? 'ADMIN' : 'MEMBER'
        }))
      }
    },
    include: {
      members: true
    }
  })
  return room
}

export async function getRooms(userId: string) {
  return db.room.findMany({
    where: {
      members: { some: { userId } }
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1
      },
      members: {
        include: {
          user: { select: { profile: { select: { displayName: true, photos: { take: 1 } } } } }
        }
      }
    }
  })
}

export async function getRoomMessages(roomId: string, userId: string) {
  // Verify membership
  await db.roomMember.findUniqueOrThrow({
    where: { roomId_userId: { roomId, userId } }
  })

  return db.message.findMany({
    where: { roomId },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
}
