import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { db } from '../lib/db.js'
import { clearDatabase } from './test-utils.js'

describe('Discovery Module', () => {
  beforeEach(async () => {
    await clearDatabase()
  })

  it('GET /api/v1/discovery/feed returns a list of profiles', async () => {
    const app = buildApp()
    
    const regMe = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { 
        email: 'me@e.com', 
        password: 'Password123!', 
        phone: '+15551111111', 
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        accountType: 'MAN',
        nickname: 'meuser',
        publicKey: 'test-key'
      }
    })
    const { accessToken } = JSON.parse(regMe.body)

    const regOther = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { 
        email: 'other@e.com', 
        password: 'Password123!', 
        phone: '+15552222222', 
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        accountType: 'WOMAN',
        nickname: 'otheruser',
        publicKey: 'test-key-2'
      }
    })
    const otherUserId = JSON.parse(regOther.body).user.id
    await db.profile.update({
      where: { userId: otherUserId },
      data: { isVisible: true, displayName: 'Other User' }
    })

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/discovery/feed',
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(Array.isArray(body)).toBe(true)
    expect(body.length).toBeGreaterThan(0)
  })

  it('POST /api/v1/discovery/vibe records a like', async () => {
    const app = buildApp()
    
    const reg1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { 
        email: 'v1@e.com', 
        password: 'Password123!', 
        phone: '+15553333333', 
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        accountType: 'MAN',
        nickname: 'v1user',
        publicKey: 'test-key-v1'
      }
    })
    const { accessToken } = JSON.parse(reg1.body)

    const reg2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { 
        email: 'v2@e.com', 
        password: 'Password123!', 
        phone: '+15554444444', 
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        accountType: 'WOMAN',
        nickname: 'v2user',
        publicKey: 'test-key-v2'
      }
    })
    const otherUserId = JSON.parse(reg2.body).user.id

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/discovery/vibe',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: { targetId: otherUserId, type: 'like' }
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body).status).toBe('ok')
  })

  it('Mutual likes create a match', async () => {
    const app = buildApp()
    
    const reg1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { 
        email: 'm1@e.com', 
        password: 'Password123!', 
        phone: '+15555555555', 
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        accountType: 'MAN',
        nickname: 'm1user',
        publicKey: 'test-key-m1'
      }
    })
    const u1Token = JSON.parse(reg1.body).accessToken
    const u1Id = JSON.parse(reg1.body).user.id

    // User 2
    const reg2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { 
        email: 'm2@e.com', 
        password: 'Password123!', 
        phone: '+15556666666', 
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        accountType: 'WOMAN',
        nickname: 'm2user',
        publicKey: 'test-key-m2'
      }
    })
    const u2Token = JSON.parse(reg2.body).accessToken
    const u2Id = JSON.parse(reg2.body).user.id

    // User 1 likes User 2
    await app.inject({
      method: 'POST',
      url: '/api/v1/discovery/vibe',
      headers: { Authorization: `Bearer ${u1Token}` },
      payload: { targetId: u2Id, type: 'like' }
    })

    // User 2 likes User 1
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/discovery/vibe',
      headers: { Authorization: `Bearer ${u2Token}` },
      payload: { targetId: u1Id, type: 'like' }
    })

    const body = JSON.parse(res.body)
    expect(body.match).toBeDefined()
    expect(body.match.conversation).toBeDefined()
    expect(body.match.conversation.id).toBeDefined()
  })
})
