import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { clearDatabase } from './test-utils.js'
import { db } from '../lib/db.js'

const regPayload = (email: string, phone: string, nickname: string) => ({
  email,
  password: 'Password123!',
  phone,
  dateOfBirth: '1990-01-01T00:00:00.000Z',
  accountType: 'MAN' as const,
  nickname,
  publicKey: 'test-public-key',
})

async function register(app: ReturnType<typeof buildApp>, payload: ReturnType<typeof regPayload>) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload,
  })
  expect([200, 201]).toContain(res.statusCode)
  return JSON.parse(res.body) as { accessToken: string }
}

describe('posts API', () => {
  beforeEach(async () => {
    await clearDatabase()
  })

  it('POST /api/v1/posts returns 401 without auth', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      payload: { content: 'hi', visibility: 'PUBLIC', mediaKeys: [] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('creates a public post', async () => {
    const app = buildApp()
    const { accessToken } = await register(app, regPayload('a@example.com', '+15550001111', 'usera'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: { content: 'Hello world', visibility: 'PUBLIC', mediaKeys: [] },
    })
    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.content).toBe('Hello world')
    expect(body.visibility).toBe('PUBLIC')
    expect(body.mediaUrls).toEqual([])
  })

  it('rejects empty text and no media', async () => {
    const app = buildApp()
    const { accessToken } = await register(app, regPayload('b@example.com', '+15550002222', 'userb'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: { content: '   ', visibility: 'PUBLIC', mediaKeys: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid media key prefix', async () => {
    const app = buildApp()
    const { accessToken } = await register(app, regPayload('c@example.com', '+15550003333', 'userc'))
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/profiles/me',
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    const userId = JSON.parse(me.body).userId

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: {
        content: 'x',
        visibility: 'PUBLIC',
        mediaKeys: ['wrong/prefix/key.jpg'],
      },
    })
    expect(res.statusCode).toBe(400)
    expect(userId).toBeTruthy()
  })

  it('shows PUBLIC post on another user timeline', async () => {
    const app = buildApp()
    const a = await register(app, regPayload('d1@example.com', '+15550004441', 'ud1'))
    const b = await register(app, regPayload('d2@example.com', '+15550004442', 'ud2'))

    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${a.accessToken}` },
      payload: { content: 'public note', visibility: 'PUBLIC', mediaKeys: [] },
    })
    expect(create.statusCode).toBe(201)

    const tl = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${b.accessToken}` },
    })
    expect(tl.statusCode).toBe(200)
    const { data } = JSON.parse(tl.body)
    expect(data.some((p: { content: string }) => p.content === 'public note')).toBe(true)
  })

  it('hides UNLOCKED_ONLY until ProfileUnlock exists', async () => {
    const app = buildApp()
    const a = await register(app, regPayload('e1@example.com', '+15550005551', 'ue1'))
    const b = await register(app, regPayload('e2@example.com', '+15550005552', 'ue2'))

    const meA = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/profiles/me',
          headers: { Authorization: `Bearer ${a.accessToken}` },
        })
      ).body
    )
    const profileIdA = meA.id

    await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${a.accessToken}` },
      payload: { content: 'locked', visibility: 'UNLOCKED_ONLY', mediaKeys: [] },
    })

    const meB = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/profiles/me',
          headers: { Authorization: `Bearer ${b.accessToken}` },
        })
      ).body
    )

    const before = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${b.accessToken}` },
    })
    let data = JSON.parse(before.body).data
    expect(data.some((p: { content: string }) => p.content === 'locked')).toBe(false)

    await db.profileUnlock.create({
      data: { userId: meB.userId, targetId: profileIdA },
    })

    const after = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${b.accessToken}` },
    })
    data = JSON.parse(after.body).data
    expect(data.some((p: { content: string }) => p.content === 'locked')).toBe(true)
  })

  it('hides DRAFT from other users', async () => {
    const app = buildApp()
    const a = await register(app, regPayload('f1@example.com', '+15550006661', 'uf1'))
    const b = await register(app, regPayload('f2@example.com', '+15550006662', 'uf2'))

    await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${a.accessToken}` },
      payload: { content: 'secret draft', visibility: 'DRAFT', mediaKeys: [] },
    })

    const tl = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${b.accessToken}` },
    })
    const { data } = JSON.parse(tl.body)
    expect(data.some((p: { content: string }) => p.content === 'secret draft')).toBe(false)
  })

  it('returns 404 when non-author patches post', async () => {
    const app = buildApp()
    const a = await register(app, regPayload('g1@example.com', '+15550007771', 'ug1'))
    const b = await register(app, regPayload('g2@example.com', '+15550007772', 'ug2'))

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${a.accessToken}` },
      payload: { content: 'mine', visibility: 'PUBLIC', mediaKeys: [] },
    })
    const { id } = JSON.parse(created.body)

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/posts/${id}`,
      headers: { Authorization: `Bearer ${b.accessToken}` },
      payload: { content: 'hacked' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('cascades reactions when post is deleted', async () => {
    const app = buildApp()
    const { accessToken } = await register(app, regPayload('h@example.com', '+15550008888', 'uh'))

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: { content: 'r', visibility: 'PUBLIC', mediaKeys: [] },
    })
    const { id } = JSON.parse(created.body)

    await app.inject({
      method: 'POST',
      url: `/api/v1/posts/${id}/reactions`,
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: { type: 'LIKE' },
    })
    expect(await db.postReaction.count({ where: { postId: id } })).toBe(1)

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${id}`,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(del.statusCode).toBe(204)
    expect(await db.postReaction.count({ where: { postId: id } })).toBe(0)
  })

  it('returns 404 for reaction on unreadable post', async () => {
    const app = buildApp()
    const a = await register(app, regPayload('i1@example.com', '+15550009991', 'ui1'))
    const b = await register(app, regPayload('i2@example.com', '+15550009992', 'ui2'))

    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${a.accessToken}` },
      payload: { content: 'draft only', visibility: 'DRAFT', mediaKeys: [] },
    })
    const { id } = JSON.parse(created.body)

    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/posts/${id}/reactions`,
      headers: { Authorization: `Bearer ${b.accessToken}` },
      payload: { type: 'LIKE' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('lists posts on profile wall', async () => {
    const app = buildApp()
    const { accessToken } = await register(app, regPayload('j@example.com', '+15550010000', 'uj'))
    const me = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/v1/profiles/me',
          headers: { Authorization: `Bearer ${accessToken}` },
        })
      ).body
    )

    await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: { content: 'wall item', visibility: 'PUBLIC', mediaKeys: [] },
    })

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/profiles/${me.id}/posts`,
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    expect(res.statusCode).toBe(200)
    const { data } = JSON.parse(res.body)
    expect(data.some((p: { content: string }) => p.content === 'wall item')).toBe(true)
  })
})
