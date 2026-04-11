import { db } from '../../lib/db.js'

interface FeedOptions {
  userId: string
  page?: number
  limit?: number
  filters?: {
    minAge?: number
    maxAge?: number
    experienceLevel?: string
    verificationStatus?: string
  }
}

export async function getDiscoveryFeed({ userId, page = 1, limit = 20, filters = {} }: FeedOptions) {
  const skip = (page - 1) * limit

  // Get IDs user has already vibed (liked or passed)
  const vibed = await db.vibe.findMany({
    where: { senderId: userId },
    select: { receiverId: true },
  })
  const excludeIds = [userId, ...vibed.map(v => v.receiverId)]

  const whereDate: any = {}
  if (filters.minAge) {
    const maxBirth = new Date()
    maxBirth.setFullYear(maxBirth.getFullYear() - filters.minAge)
    whereDate.lte = maxBirth
  }
  if (filters.maxAge) {
    const minBirth = new Date()
    minBirth.setFullYear(minBirth.getFullYear() - filters.maxAge)
    whereDate.gte = minBirth
  }

  const profiles = await db.profile.findMany({
    where: {
      isVisible: true,
      userId: { notIn: excludeIds },
      ...(filters.experienceLevel && { experienceLevel: filters.experienceLevel }),
      ...(filters.verificationStatus && { verificationStatus: filters.verificationStatus }),
      ...(Object.keys(whereDate).length && { dateOfBirth: whereDate }),
    },
    include: {
      photos: { where: { purpose: 'profile_photo' }, orderBy: { order: 'asc' }, take: 3 },
    },
    skip,
    take: limit,
    orderBy: { createdAt: 'desc' },
  })

  return profiles
}

export async function sendVibe(senderId: string, receiverId: string, type: string) {
  // Check target exists
  const target = await db.user.findUnique({ where: { id: receiverId } })
  if (!target) {
    const error: any = new Error('User not found')
    error.statusCode = 404
    throw error
  }

  // Upsert the vibe
  await db.vibe.upsert({
    where: { senderId_receiverId: { senderId, receiverId } },
    create: { senderId, receiverId, type },
    update: { type },
  })

  let match = null

  // Check for mutual like → create match
  if (type === 'like' || type === 'super_like') {
    const mutual = await db.vibe.findFirst({
      where: {
        senderId: receiverId,
        receiverId: senderId,
        type: { in: ['like', 'super_like'] },
      },
    })

    if (mutual) {
      const [userAId, userBId] = [senderId, receiverId].sort()
      match = await db.match.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: {
          userAId,
          userBId,
          conversation: { create: {} },
        },
        update: {},
        include: { conversation: true },
      })
    }
  }

  return { vibed: true, match }
}

export async function getMatches(userId: string) {
  return db.match.findMany({
    where: {
      OR: [{ userAId: userId }, { userBId: userId }],
      status: 'active',
    },
    include: {
      userA: { select: { profile: { include: { photos: { take: 1, orderBy: { order: 'asc' } } } } } },
      userB: { select: { profile: { include: { photos: { take: 1, orderBy: { order: 'asc' } } } } } },
      conversation: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
  })
}
