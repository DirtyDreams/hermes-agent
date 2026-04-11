import { db } from '../../lib/db.js'

export async function createLinkInvite(userId: string) {
  // Check if already in a couple
  const existing = await db.couple.findFirst({
    where: {
      OR: [
        { partner1Id: userId },
        { partner2Id: userId }
      ],
      status: 'active'
    }
  })

  if (existing) throw new Error('Already in an active couple')

  return db.couple.create({
    data: {
      partner1Id: userId,
      status: 'pending'
    }
  })
}

export async function acceptLinkInvite(userId: string, inviteToken: string) {
  return db.$transaction(async (tx) => {
    const invite = await tx.couple.findUnique({
      where: { inviteToken }
    })

    if (!invite) throw new Error('Invalid invite token')
    if (invite.status !== 'pending') throw new Error('Invite already used or expired')
    if (invite.partner1Id === userId) throw new Error('Cannot link with yourself')

    // 1. Create the shared profile
    const sharedProfile = await tx.profile.create({
      data: {
        isCouple: true,
        displayName: 'New Couple',
        accountType: 'COUPLE'
      }
    })

    // 2. Link the couple and activate
    return tx.couple.update({
      where: { id: invite.id },
      data: {
        partner2Id: userId,
        status: 'active',
        profileId: sharedProfile.id
      }
    })
  })
}

export async function getCoupleData(userId: string) {
  return db.couple.findFirst({
    where: {
      OR: [
        { partner1Id: userId },
        { partner2Id: userId }
      ],
      status: 'active'
    },
    include: {
      partner1: { include: { profile: true } },
      partner2: { include: { profile: true } },
      profile: true
    }
  })
}
