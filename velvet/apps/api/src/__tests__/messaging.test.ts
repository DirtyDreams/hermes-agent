import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { db } from '../lib/db.js'

describe('Messaging Module', () => {
  beforeEach(async () => {
    await db.message.deleteMany()
    await db.conversation.deleteMany()
    await db.match.deleteMany()
    await db.vibe.deleteMany()
    await db.couple.deleteMany()
    await db.user.deleteMany()
  })

  it('Exchanges public keys and fetches history', async () => {
    const app = buildApp()
    
    // 1. Setup Match
    const reg1 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'm1@e.com', password: 'Password123!', phone: '+15551111111', dateOfBirth: '1990-01-01T00:00:00.000Z' }
    })
    const u1Token = JSON.parse(reg1.body).accessToken
    const u1Id = JSON.parse(reg1.body).user.id

    const reg2 = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: 'm2@e.com', password: 'Password123!', phone: '+15552222222', dateOfBirth: '1990-01-01T00:00:00.000Z' }
    })
    const u2Token = JSON.parse(reg2.body).accessToken
    const u2Id = JSON.parse(reg2.body).user.id

    // Mutual likes
    await app.inject({
      method: 'POST',
      url: '/api/v1/discovery/vibe',
      headers: { Authorization: `Bearer ${u1Token}` },
      payload: { targetId: u2Id, type: 'like' }
    })
    const vibeRes = await app.inject({
      method: 'POST',
      url: '/api/v1/discovery/vibe',
      headers: { Authorization: `Bearer ${u2Token}` },
      payload: { targetId: u1Id, type: 'like' }
    })
    const { match } = JSON.parse(vibeRes.body)
    const convId = match.conversation.id

    // 2. Exchange Keys
    const keyRes = await app.inject({
      method: 'POST',
      url: `/api/v1/conversations/${convId}/keys`,
      headers: { Authorization: `Bearer ${u1Token}` },
      payload: { publicKey: 'user1-key' }
    })
    expect(keyRes.statusCode).toBe(200)
    expect(JSON.parse(keyRes.body).keyA).toBe('user1-key')

    // 3. Save a message (via service since socket testing is complex in memory)
    const { saveMessage } = await import('../modules/messaging/messaging.service.js')
    await saveMessage(convId, u1Id, 'encrypted-text', 'nonce-123')

    // 4. Fetch History
    const historyRes = await app.inject({
      method: 'GET',
      url: `/api/v1/conversations/${convId}`,
      headers: { Authorization: `Bearer ${u2Token}` }
    })
    expect(historyRes.statusCode).toBe(200)
    expect(JSON.parse(historyRes.body).length).toBe(1)
  })
})
