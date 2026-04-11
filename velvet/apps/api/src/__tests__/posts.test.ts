import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { clearDatabase } from './test-utils.js'
import { db } from '../lib/db.js'

const registerPayload = (email: string, nickname: string, phone: string) => ({
  email,
  password: 'Password123!',
  phone,
  dateOfBirth: '1990-01-01T00:00:00.000Z',
  accountType: 'MAN' as const,
  nickname,
  publicKey: 'test-key',
})

async function registerUser(
  app: ReturnType<typeof buildApp>,
  email: string,
  nickname: string,
  phone: string
) {
  const regRes = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: registerPayload(email, nickname, phone),
  })
  expect(regRes.statusCode).toBe(201)
  const body = JSON.parse(regRes.body) as { accessToken: string; user: { id: string } }
  return { accessToken: body.accessToken, userId: body.user.id }
}

describe('posts API', () => {
  beforeEach(async () => {
    await clearDatabase()
  })

  it('POST /api/v1/posts returns 401 without token', async () => {
    const app = buildApp()
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      payload: { content: 'hi', visibility: 'PUBLIC', mediaKeys: [] },
    })
    expect(res.statusCode).toBe(401)
  })

  it('creates a post with mediaUrls and visibility', async () => {
    const app = buildApp()
    const { accessToken: token } = await registerUser(app, 'a@example.com', 'usera', '+15560101111')
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: 'Hello world', visibility: 'PUBLIC', mediaKeys: [] },
    })
    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body) as { data: { id: string; visibility: string; mediaUrls: unknown[] } }
    expect(body.data.visibility).toBe('PUBLIC')
    expect(body.data.mediaUrls).toEqual([])
    expect(body.data.id).toBeTruthy()
  })

  it('rejects empty content and empty mediaKeys', async () => {
    const app = buildApp()
    const { accessToken: token } = await registerUser(app, 'b@example.com', 'userb', '+15560102222')
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: '   ', visibility: 'PUBLIC', mediaKeys: [] },
    })
    expect(res.statusCode).toBe(400)
  })

  it('rejects invalid media key prefix', async () => {
    const app = buildApp()
    const { accessToken: token } = await registerUser(app, 'c@example.com', 'userc', '+15560103333')
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${token}` },
      payload: {
        content: 'x',
        visibility: 'PUBLIC',
        mediaKeys: ['POST_MEDIA/wrong-user/foo.jpg'],
      },
    })
    expect(res.statusCode).toBe(400)
  })

  it('PUBLIC post appears on another user timeline', async () => {
    const app = buildApp()
    const { accessToken: t1 } = await registerUser(app, 'd1@example.com', 'duser1', '+15560104441')
    await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${t1}` },
      payload: { content: 'Public post', visibility: 'PUBLIC', mediaKeys: [] },
    })
    const { accessToken: t2 } = await registerUser(app, 'd2@example.com', 'duser2', '+15560104442')
    const tl = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${t2}` },
    })
    expect(tl.statusCode).toBe(200)
    const body = JSON.parse(tl.body) as { data: { content: string }[] }
    expect(body.data.some((p) => p.content === 'Public post')).toBe(true)
  })

  it('UNLOCKED_ONLY hidden until ProfileUnlock exists', async () => {
    const app = buildApp()
    const { accessToken: tAuthor, userId: authorUserId } = await registerUser(
      app,
      'e1@example.com',
      'euser1',
      '+15560105551'
    )
    const authorProfile = await db.profile.findUniqueOrThrow({ where: { userId: authorUserId } })

    await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${tAuthor}` },
      payload: { content: 'Secret', visibility: 'UNLOCKED_ONLY', mediaKeys: [] },
    })

    const { accessToken: tViewer, userId: viewerUserId } = await registerUser(
      app,
      'e2@example.com',
      'euser2',
      '+15560105552'
    )
    const tlBefore = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${tViewer}` },
    })
    const before = JSON.parse(tlBefore.body) as { data: { content: string }[] }
    expect(before.data.some((p) => p.content === 'Secret')).toBe(false)

    await db.profileUnlock.create({
      data: {
        userId: viewerUserId,
        targetId: authorProfile.id,
      },
    })

    const tlAfter = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${tViewer}` },
    })
    const after = JSON.parse(tlAfter.body) as { data: { content: string }[] }
    expect(after.data.some((p) => p.content === 'Secret')).toBe(true)
  })

  it('DRAFT visible to author only on timeline', async () => {
    const app = buildApp()
    const { accessToken: t1 } = await registerUser(app, 'f1@example.com', 'fuser1', '+15560106661')
    await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${t1}` },
      payload: { content: 'Draft only', visibility: 'DRAFT', mediaKeys: [] },
    })
    const me = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${t1}` },
    })
    const mine = JSON.parse(me.body) as { data: { content: string }[] }
    expect(mine.data.some((p) => p.content === 'Draft only')).toBe(true)

    const { accessToken: t2 } = await registerUser(app, 'f2@example.com', 'fuser2', '+15560106662')
    const other = await app.inject({
      method: 'GET',
      url: '/api/v1/posts/timeline',
      headers: { Authorization: `Bearer ${t2}` },
    })
    const theirs = JSON.parse(other.body) as { data: { content: string }[] }
    expect(theirs.data.some((p) => p.content === 'Draft only')).toBe(false)
  })

  it('PATCH non-author returns 404', async () => {
    const app = buildApp()
    const { accessToken: t1 } = await registerUser(app, 'g1@example.com', 'guser1', '+15560107771')
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${t1}` },
      payload: { content: 'mine', visibility: 'PUBLIC', mediaKeys: [] },
    })
    const postId = (JSON.parse(create.body) as { data: { id: string } }).data.id
    const { accessToken: t2 } = await registerUser(app, 'g2@example.com', 'guser2', '+15560107772')
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/v1/posts/${postId}`,
      headers: { Authorization: `Bearer ${t2}` },
      payload: { content: 'hacked' },
    })
    expect(patch.statusCode).toBe(404)
  })

  it('DELETE author removes post and reactions cascade', async () => {
    const app = buildApp()
    const { accessToken: t1 } = await registerUser(app, 'h1@example.com', 'huser1', '+15560108881')
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${t1}` },
      payload: { content: 'del', visibility: 'PUBLIC', mediaKeys: [] },
    })
    const postId = (JSON.parse(create.body) as { data: { id: string } }).data.id
    const { accessToken: t2 } = await registerUser(app, 'h2@example.com', 'huser2', '+15560108882')
    await app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/reactions`,
      headers: { Authorization: `Bearer ${t2}` },
      payload: { type: 'LIKE' },
    })
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/v1/posts/${postId}`,
      headers: { Authorization: `Bearer ${t1}` },
    })
    expect(del.statusCode).toBe(204)
    const reactions = await db.postReaction.findMany({ where: { postId } })
    expect(reactions.length).toBe(0)
  })

  it('reaction on unreadable post returns 404', async () => {
    const app = buildApp()
    const { accessToken: t1 } = await registerUser(app, 'i1@example.com', 'iuser1', '+15560109991')
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${t1}` },
      payload: { content: 'hidden', visibility: 'DRAFT', mediaKeys: [] },
    })
    const postId = (JSON.parse(create.body) as { data: { id: string } }).data.id
    const { accessToken: t2 } = await registerUser(app, 'i2@example.com', 'iuser2', '+15560109992')
    const react = await app.inject({
      method: 'POST',
      url: `/api/v1/posts/${postId}/reactions`,
      headers: { Authorization: `Bearer ${t2}` },
      payload: { type: 'LIKE' },
    })
    expect(react.statusCode).toBe(404)
  })

  it('GET /profiles/:id/posts returns wall posts', async () => {
    const app = buildApp()
    const { accessToken: token } = await registerUser(app, 'j1@example.com', 'juser1', '+15560110111')
    const prof = await app.inject({
      method: 'GET',
      url: '/api/v1/profiles/me',
      headers: { Authorization: `Bearer ${token}` },
    })
    const profileId = (JSON.parse(prof.body) as { id: string }).id
    await app.inject({
      method: 'POST',
      url: '/api/v1/posts',
      headers: { Authorization: `Bearer ${token}` },
      payload: { content: 'Wall', visibility: 'PUBLIC', mediaKeys: [] },
    })
    const wall = await app.inject({
      method: 'GET',
      url: `/api/v1/profiles/${profileId}/posts`,
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(wall.statusCode).toBe(200)
    const body = JSON.parse(wall.body) as { data: { content: string }[] }
    expect(body.data.some((p) => p.content === 'Wall')).toBe(true)
  })
})
