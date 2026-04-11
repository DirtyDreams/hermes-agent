import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import { db } from '../../lib/db.js'
import { hashEmail } from '../../lib/crypto.js'
import type { RegisterInput, LoginInput } from '@velvet/shared'

const BCRYPT_ROUNDS = 12

export async function registerUser(input: RegisterInput) {
  const emailHash = hashEmail(input.email)

  const existing = await db.user.findUnique({ where: { emailHash } })
  if (existing) {
    const error: any = new Error('Email already registered')
    error.statusCode = 409
    throw error
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS)

  const user = await db.user.create({
    data: {
      emailHash,
      passwordHash,
      phone: input.phone,
      publicKey: input.publicKey,
      profile: {
        create: {
          nickname: input.nickname,
          accountType: input.accountType,
          dateOfBirth: new Date(input.dateOfBirth),
        },
      },
    },
    select: { id: true, createdAt: true },
  })

  return user
}

export async function loginUser(input: LoginInput) {
  const emailHash = hashEmail(input.email)
  const user = await db.user.findUnique({ where: { emailHash } })

  if (!user || !await bcrypt.compare(input.password, user.passwordHash)) {
    const error: any = new Error('Invalid email or password')
    error.statusCode = 401
    throw error
  }

  if (!user.isActive) {
    const error: any = new Error('Account suspended')
    error.statusCode = 403
    throw error
  }

  return { id: user.id }
}

export async function createSession(userId: string, deviceInfo?: string) {
  const refreshToken = crypto.randomBytes(64).toString('hex')
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days

  await db.session.create({
    data: { userId, refreshToken, deviceInfo, expiresAt },
  })

  return refreshToken
}
