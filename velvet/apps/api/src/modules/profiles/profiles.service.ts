import { db } from '../../lib/db.js'
import type { UpdateProfileInput } from '@velvet/shared'

export async function getProfile(profileId: string) {
  return db.profile.findUniqueOrThrow({
    where: { id: profileId },
    include: {
      photos: { orderBy: { order: 'asc' } },
    },
  })
}

export async function getProfileByUserId(userId: string) {
  return db.profile.findUniqueOrThrow({
    where: { userId },
    include: { photos: { orderBy: { order: 'asc' } } },
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
