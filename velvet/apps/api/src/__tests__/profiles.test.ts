import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { db } from '../lib/db.js'

describe('GET /api/v1/profiles/me', () => {
  beforeEach(async () => {
    await db.couple.deleteMany()
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

  it('generates a partner invite token', async () => {
    const app = buildApp()
    const regRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'partner1@example.com',
        password: 'Password123!',
        phone: '+15551112222',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
      },
    })
    const { accessToken } = JSON.parse(regRes.body)

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/profiles/partner/invite',
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toHaveProperty('inviteToken')
  })

  it('links two users as a couple', async () => {
    const app = buildApp()
    
    // 1. Register Partner 1 and get invite
    const reg1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { 
        email: 'p1@example.com', 
        password: 'Password123!', 
        phone: '+15551112222', 
        dateOfBirth: '1990-01-01T00:00:00.000Z' 
      }
    })
    const inviteRes = await app.inject({
      method: 'POST',
      url: '/api/v1/profiles/partner/invite',
      headers: { Authorization: `Bearer ${JSON.parse(reg1.body).accessToken}` }
    })
    const { inviteToken } = JSON.parse(inviteRes.body)

    // 2. Register Partner 2 and accept invite
    const reg2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { 
        email: 'p2@example.com', 
        password: 'Password123!', 
        phone: '+15552223333', 
        dateOfBirth: '1990-01-01T00:00:00.000Z' 
      }
    })
    const acceptRes = await app.inject({
      method: 'POST',
      url: '/api/v1/profiles/partner/accept',
      headers: { Authorization: `Bearer ${JSON.parse(reg2.body).accessToken}` },
      payload: { token: inviteToken }
    })

    expect(acceptRes.statusCode).toBe(200)
    expect(JSON.parse(acceptRes.body).status).toBe('linked')
  })
})
