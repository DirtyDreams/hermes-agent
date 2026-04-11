import { describe, it, expect } from 'vitest'
import { db } from '../lib/db.js'

describe('Prisma DB', () => {
  it('should be able to query the User table', async () => {
    // This will fail because the User model is not in the schema yet, 
    // or the DB client is not set up.
    const users = await db.user.findMany()
    expect(Array.isArray(users)).toBe(true)
  })
})
