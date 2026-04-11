import { db } from '../../lib/db.js'

export async function addCredits(userId: string, amount: number, type: 'PURCHASE' | 'REWARD' | 'REFUND') {
  return db.$transaction(async (tx) => {
    // 1. Create transaction log
    await tx.creditTransaction.create({
      data: {
        userId,
        amount,
        type
      }
    })

    // 2. Update user balance
    return tx.user.update({
      where: { id: userId },
      data: {
        credits: { increment: amount }
      }
    })
  })
}

export async function spendCredits(userId: string, amount: number, type: 'SHOUT_PIN' | 'BOOST' | 'GIFT') {
  return db.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { credits: true }
    })

    if (!user || user.credits < amount) {
      throw new Error('Insufficient credits')
    }

    // 1. Create transaction log (negative amount)
    await tx.creditTransaction.create({
      data: {
        userId,
        amount: -amount,
        type: `SPEND_${type}`
      }
    })

    // 2. Update user balance
    return tx.user.update({
      where: { id: userId },
      data: {
        credits: { decrement: amount }
      }
    })
  })
}

export async function getCreditBalance(userId: string) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { credits: true }
  })
  return user?.credits || 0
}

export async function getTransactionHistory(userId: string) {
  return db.creditTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50
  })
}
