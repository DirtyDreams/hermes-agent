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
  conversationId: string,
  senderId: string,
  encryptedContent: string,
  nonce: string,
  contentType = 'text'
) {
  return db.message.create({
    data: { conversationId, senderId, encryptedContent, nonce, contentType },
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
