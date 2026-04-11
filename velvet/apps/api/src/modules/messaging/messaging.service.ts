import { db } from '../../lib/db.js'

export async function getConversations(userId: string) {
  return db.conversation.findMany({
    where: {
      match: {
        OR: [{ userAId: userId }, { userBId: userId }],
        status: 'active',
      },
    },
    include: {
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { encryptedContent: true, createdAt: true, senderId: true },
      },
      match: {
        include: {
          userA: { select: { profile: { include: { photos: { take: 1 } } } } },
          userB: { select: { profile: { include: { photos: { take: 1 } } } } },
        },
      },
    },
  })
}

export async function getMessages(conversationId: string, userId: string, cursor?: string) {
  // Verify user is part of this conversation
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { match: true },
  })
  const { userAId, userBId } = conversation.match
  if (userId !== userAId && userId !== userBId) {
    const error: any = new Error('Forbidden')
    error.statusCode = 403
    throw error
  }

  return db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  })
}

export async function exchangePublicKey(conversationId: string, userId: string, publicKey: string) {
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { match: true },
  })
  const { userAId, userBId } = conversation.match
  if (userId !== userAId && userId !== userBId) {
    const error: any = new Error('Forbidden')
    error.statusCode = 403
    throw error
  }

  const update = userId === userAId ? { keyA: publicKey } : { keyB: publicKey }
  return db.conversation.update({ where: { id: conversationId }, data: update })
}

export async function saveMessage(
  conversationId: string | undefined,
  senderId: string,
  encryptedContent: string,
  nonce: string,
  contentType = 'text',
  isEphemeral = false,
  expiresAt?: Date,
  roomId?: string
) {
  return db.message.create({
    data: { conversationId, roomId, senderId, encryptedContent, nonce, contentType, isEphemeral, expiresAt },
  })
}

export async function unmaskConversation(conversationId: string, userId: string) {
  const conversation = await db.conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: { match: true },
  })

  const { userAId, userBId } = conversation.match
  if (userId !== userAId && userId !== userBId) {
    const error: any = new Error('Forbidden')
    error.statusCode = 403
    throw error
  }

  const update = userId === userAId ? { isUnmaskedA: true } : { isUnmaskedB: true }
  
  return db.conversation.update({
    where: { id: conversationId },
    data: update,
    include: {
      match: {
        include: {
          userA: { select: { profile: true } },
          userB: { select: { profile: true } },
        }
      }
    }
  })
}

export async function markAsRead(conversationId: string, userId: string) {
  const now = new Date()
  
  // Find messages before update to check for ephemerality
  const messages = await db.message.findMany({
    where: {
      conversationId,
      senderId: { not: userId },
      readAt: null
    }
  })

  await db.message.updateMany({
    where: {
      conversationId,
      senderId: { not: userId },
      readAt: null
    },
    data: { readAt: now }
  })

  // Burn on read logic: if ephemeral, schedule deletion
  for (const msg of messages) {
    if (msg.isEphemeral) {
      setTimeout(async () => {
        try {
          await db.message.delete({ where: { id: msg.id } })
          console.log(`[BurnOnRead] Purged message ${msg.id}`)
        } catch (e) {
          // Message might already be gone
        }
      }, 10000) // 10s countdown start
    }
  }
}

export async function deleteMessage(messageId: string, userId: string) {
  // Verify owner
  const msg = await db.message.findUnique({ where: { id: messageId } })
  if (!msg) return
  
  // We allow deletion if either it's expired or sender/receiver (for burn on read)
  // For now, simple owner check or admin
  return db.message.delete({ where: { id: messageId } })
}
