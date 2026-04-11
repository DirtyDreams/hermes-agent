import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { db } from '../lib/db.js'

describe('GET /api/v1/profiles/me', () => {
  beforeEach(async () => {
    await db.user.deleteMany()
  })

  it('returns the authenticated user profile', async () => {
    const app = buildApp()
    
    // 1. Register
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'profile@example.com',
        password: 'Password123!',
        phone: '+15550001111',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
      },
    })
    const { accessToken } = JSON.parse(regRes.body)

    // 2. Get profile
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/profiles/me',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toHaveProperty('dateOfBirth')
  })

  it('rejects unauthorized access', async () => {
    const app = buildApp()
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/profiles/me',
    })
    expect(response.statusCode).toBe(401)
  })
})
