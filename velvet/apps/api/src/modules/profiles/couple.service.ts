import { db } from '../../lib/db.js'

export async function generatePartnerInvite(userId: string) {
  // Upsert couple record with this user as partner1
  const couple = await db.couple.upsert({
    where: { partner1Id: userId },
    create: { partner1Id: userId },
    update: {}, // keep existing inviteToken if regenerating same invite
  })
  return { inviteToken: couple.inviteToken }
}

export async function acceptPartnerInvite(userId: string, token: string) {
  const couple = await db.couple.findUnique({ where: { inviteToken: token } })
  if (!couple) {
    const error: any = new Error('Invalid invite token')
    error.statusCode = 404
    throw error
  }
  if (couple.partner1Id === userId) {
    const error: any = new Error('Cannot link to yourself')
    error.statusCode = 400
    throw error
  }
  if (couple.partner2Id) {
    const error: any = new Error('Invite already used')
    error.statusCode = 409
    throw error
  }

  await db.couple.update({
    where: { id: couple.id },
    data: { partner2Id: userId, status: 'active' },
  })

  // Mark both profiles as couple
  await db.profile.updateMany({
    where: { userId: { in: [couple.partner1Id, userId] } },
    data: { isCouple: true },
  })

  return { status: 'linked' }
}
