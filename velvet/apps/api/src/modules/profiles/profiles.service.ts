import { db } from '../../lib/db.js'
import type { UpdateProfileInput } from '@velvet/shared'
import { spendCredits } from '../economy/economy.service.js'

export async function getProfile(profileId: string) {
  return db.profile.findUniqueOrThrow({
    where: { id: profileId },
    include: {
      photos: { orderBy: { order: 'asc' } },
      coupleProfile: {
        include: {
          partner1: { select: { id: true, publicKey: true } },
          partner2: { select: { id: true, publicKey: true } },
        }
      }
    },
  })
}

export async function getProfileByUserId(userId: string) {
  return db.profile.findUniqueOrThrow({
    where: { userId },
    include: { 
      photos: { orderBy: { order: 'asc' } },
      coupleProfile: true
    },
  })
}

export async function updateProfile(userId: string, input: UpdateProfileInput) {
  const profile = await db.profile.findUniqueOrThrow({ where: { userId } })

  const updated = await db.profile.update({
    where: { userId },
    data: {
      ...input,
    },
  })

  // Mark visible if minimum fields complete
  const isComplete = !!(
    updated.displayName &&
    updated.dateOfBirth &&
    updated.locationCity &&
    updated.relationshipStatus &&
    updated.experienceLevel
  )
  if (isComplete && !updated.isVisible) {
    await db.profile.update({ where: { userId }, data: { isVisible: true } })
  }

  return updated
}

export async function unlockProfile(userId: string, targetProfileId: string) {
  const UNLOCK_COST = 50

  return db.$transaction(async (tx) => {
    // 1. Check if already unlocked
    const existing = await tx.profileUnlock.findUnique({
      where: {
        userId_targetId: { userId, targetId: targetProfileId }
      }
    })
    if (existing) return existing

    // 2. Spend credits
    await spendCredits(userId, UNLOCK_COST, 'BOOST' as any)

    // 3. Find if target belongs to a couple
    const targetProfile = await tx.profile.findUnique({
      where: { id: targetProfileId },
      include: { coupleProfile: true }
    })

    const profilesToUnlock = [targetProfileId]
    if (targetProfile?.coupleProfile) {
      // If couple, find the other partner's profile
      const otherPartnerId = targetProfile.coupleProfile.partner1Id === targetProfile.id 
        ? targetProfile.coupleProfile.partner2Id 
        : targetProfile.coupleProfile.partner1Id
      
      if (otherPartnerId) profilesToUnlock.push(otherPartnerId)
    }

    // 4. Create unlock record(s)
    return Promise.all(profilesToUnlock.map(id => 
      tx.profileUnlock.upsert({
        where: { userId_targetId: { userId, targetId: id } },
        update: {},
        create: { userId, targetId: id }
      })
    ))
  })
}
