import type { Prisma } from '@prisma/client'
import {
  CreatePostSchema,
  UpdatePostSchema,
  CreateCommentSchema,
  assertNonEmptyPost,
  type ReactionType,
} from '@velvet/shared'
import type { FastifyInstance } from 'fastify'
import { db } from '../../lib/db.js'
import { getPublicUrl } from '../../lib/storage.js'

export const MAX_POST_MEDIA = 4
export type PostAuthorDto = {
  id: string
  nickname: string | null
  displayName: string | null
  avatarUrl: string | null
}

export type CommentDto = {
  id: string
  content: string
  createdAt: string
  author: PostAuthorDto
}

export type PostDto = {
  id: string
  content: string
  visibility: string
  mediaKeys: string[]
  mediaUrls: string[]
  isEncrypted: boolean
  hashtags: string[]
  location: string | null
  commentCount: number
  latestComments: CommentDto[]
  createdAt: string
  updatedAt: string
  author: PostAuthorDto
  reactionCounts: Record<string, number>
  viewerReaction: string | null
}

export class HttpError extends Error {
  constructor(
    message: string,
    public statusCode: number
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

function mediaKeyPrefix(userId: string) {
  return `POST_MEDIA/${userId}/`
}

export function validateMediaKeys(authorId: string, keys: string[]) {
  if (keys.length > MAX_POST_MEDIA) {
    throw new HttpError(`At most ${MAX_POST_MEDIA} media attachments`, 400)
  }
  const prefix = mediaKeyPrefix(authorId)
  for (const key of keys) {
    if (!key.startsWith(prefix)) {
      throw new HttpError('Invalid media key for this user', 400)
    }
  }
}

async function getUnlockedProfileIds(viewerId: string): Promise<Set<string>> {
  const rows = await db.profileUnlock.findMany({
    where: { userId: viewerId },
    select: { targetId: true },
  })
  return new Set(rows.map((r) => r.targetId))
}

export function timelineWhereForViewer(
  viewerId: string,
  unlocked: Set<string>
): Prisma.PostWhereInput {
  const unlockedArr = [...unlocked]
  const parts: Prisma.PostWhereInput[] = [
    { authorId: viewerId },
    { visibility: 'PUBLIC' },
  ]
  if (unlockedArr.length > 0) {
    parts.push({
      AND: [
        { visibility: 'UNLOCKED_ONLY' },
        {
          OR: [
            { author: { profile: { id: { in: unlockedArr } } } },
            { author: { coupleAsP1: { profileId: { in: unlockedArr } } } },
            { author: { coupleAsP2: { profileId: { in: unlockedArr } } } },
          ],
        },
      ],
    })
  }
  return { OR: parts }
}

const postInclude = {
  author: {
    include: {
      profile: { include: { photos: { orderBy: { order: 'asc' as const }, take: 1 } } },
      coupleAsP1: true,
      coupleAsP2: true,
    },
  },
  reactions: true,
  comments: {
    include: {
      author: {
        include: {
          profile: { include: { photos: { orderBy: { order: 'asc' as const }, take: 1 } } },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: 3,
  },
  _count: {
    select: { comments: true },
  },
} satisfies Prisma.PostInclude

type PostLoaded = Prisma.PostGetPayload<{ include: typeof postInclude }>
type CommentLoaded = Exclude<PostLoaded['comments'][number], undefined>

function toCommentDto(c: CommentLoaded): CommentDto {
  const profile = c.author.profile
  return {
    id: c.id,
    content: c.content,
    createdAt: c.createdAt.toISOString(),
    author: {
      id: c.userId,
      nickname: profile?.nickname ?? null,
      displayName: profile?.displayName ?? null,
      avatarUrl: profile?.photos?.[0]?.cdnUrl ?? null,
    },
  }
}

function reactionCounts(reactions: { type: string }[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const r of reactions) {
    out[r.type] = (out[r.type] ?? 0) + 1
  }
  return out
}

export function toPostDto(post: PostLoaded, viewerId: string): PostDto {
  const profile = post.author.profile
  const avatarUrl = profile?.photos?.[0]?.cdnUrl ?? null

  const viewerReaction =
    post.reactions.find((r) => r.userId === viewerId)?.type ?? null

  return {
    id: post.id,
    content: post.content,
    visibility: post.visibility,
    mediaKeys: post.mediaKeys,
    mediaUrls: post.mediaKeys.map((k) => getPublicUrl(k)),
    isEncrypted: post.isEncrypted,
    hashtags: post.hashtags,
    location: post.location,
    commentCount: post._count.comments,
    latestComments: post.comments.map(toCommentDto),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    author: {
      id: post.authorId,
      nickname: profile?.nickname ?? null,
      displayName: profile?.displayName ?? null,
      avatarUrl,
    },
    reactionCounts: reactionCounts(post.reactions),
    viewerReaction,
  }
}

function encodeCursor(createdAt: Date, id: string) {
  return `${createdAt.toISOString()}|${id}`
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const pipe = cursor.indexOf('|')
  if (pipe === -1) throw new HttpError('Invalid cursor', 400)
  const createdAt = new Date(cursor.slice(0, pipe))
  const id = cursor.slice(pipe + 1)
  if (Number.isNaN(createdAt.getTime()) || !id) throw new HttpError('Invalid cursor', 400)
  return { createdAt, id }
}

export async function createPost(app: FastifyInstance, userId: string, body: unknown) {
  const parsed = CreatePostSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(JSON.stringify(parsed.error.format()), 400)
  }
  const { content, visibility, mediaKeys, isEncrypted, hashtags, location } = parsed.data
  try {
    assertNonEmptyPost(content, mediaKeys)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid post'
    throw new HttpError(msg, 400)
  }
  validateMediaKeys(userId, mediaKeys)

  const post = await db.post.create({
    data: {
      authorId: userId,
      content,
      visibility,
      mediaKeys,
      isEncrypted,
      hashtags,
      location,
    },
    include: postInclude,
  })

  const dto = toPostDto(post, userId)
  app.io.emit('post:new', { post: dto })
  await app.redis.del('feed:global')

  return dto
}

export async function updatePost(app: FastifyInstance, userId: string, postId: string, body: unknown) {
  const existing = await db.post.findUnique({ where: { id: postId } })
  if (!existing || existing.authorId !== userId) {
    throw new HttpError('Post not found', 404)
  }

  const parsed = UpdatePostSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(JSON.stringify(parsed.error.format()), 400)
  }
  const patch = parsed.data

  const nextContent = patch.content ?? existing.content
  const nextVisibility = patch.visibility ?? existing.visibility
  const nextKeys = patch.mediaKeys !== undefined ? patch.mediaKeys : existing.mediaKeys

  try {
    assertNonEmptyPost(nextContent, nextKeys)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Invalid post'
    throw new HttpError(msg, 400)
  }
  if (patch.mediaKeys !== undefined) {
    validateMediaKeys(userId, nextKeys)
  }

  const post = await db.post.update({
    where: { id: postId },
    data: {
      ...(patch.content !== undefined ? { content: patch.content } : {}),
      ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
      ...(patch.mediaKeys !== undefined ? { mediaKeys: patch.mediaKeys } : {}),
      ...(patch.isEncrypted !== undefined ? { isEncrypted: patch.isEncrypted } : {}),
      ...(patch.hashtags !== undefined ? { hashtags: patch.hashtags } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
    },
    include: postInclude,
  })

  const dto = toPostDto(post, userId)
  app.io.emit('post:update', { post: dto })
  await app.redis.del('feed:global')

  return dto
}

export async function deletePost(app: FastifyInstance, userId: string, postId: string) {
  const existing = await db.post.findUnique({ where: { id: postId } })
  if (!existing || existing.authorId !== userId) {
    throw new HttpError('Post not found', 404)
  }
  await db.post.delete({ where: { id: postId } })
  app.io.emit('post:delete', { postId })
  await app.redis.del('feed:global')
}

export async function listTimeline(
  app: FastifyInstance,
  viewerId: string,
  opts: { cursor?: string; limit: number }
) {
  const isFirstPage = !opts.cursor && opts.limit <= 20
  if (isFirstPage) {
    const cached = await app.redis.get('feed:global')
    if (cached) {
      try {
        return JSON.parse(cached)
      } catch {
        // ignore
      }
    }
  }

  const unlocked = await getUnlockedProfileIds(viewerId)
  const baseWhere = timelineWhereForViewer(viewerId, unlocked)

  let where: Prisma.PostWhereInput = baseWhere
  if (opts.cursor) {
    const { createdAt, id } = decodeCursor(opts.cursor)
    where = {
      AND: [
        baseWhere,
        {
          OR: [
            { createdAt: { lt: createdAt } },
            {
              AND: [
                { createdAt: { equals: createdAt } },
                { id: { lt: id } },
              ],
            },
          ],
        },
      ],
    }
  }

  const take = Math.min(opts.limit + 1, 51)
  const rows = await db.post.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    include: postInclude,
  })

  const hasMore = rows.length > opts.limit
  const page = hasMore ? rows.slice(0, opts.limit) : rows
  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
      : null

  const result = {
    data: page.map((p) => toPostDto(p, viewerId)),
    nextCursor,
  }

  if (isFirstPage) {
    await app.redis.setex('feed:global', 60, JSON.stringify(result))
  }

  return result
}

async function resolveWallAuthorIds(profileId: string): Promise<string[]> {
  const profile = await db.profile.findUnique({ where: { id: profileId } })
  if (!profile) {
    throw new HttpError('Profile not found', 404)
  }
  if (profile.userId) {
    return [profile.userId]
  }
  const couple = await db.couple.findUnique({ where: { profileId } })
  if (!couple) {
    return []
  }
  return [couple.partner1Id, couple.partner2Id].filter(Boolean) as string[]
}

export async function listPostsForProfile(
  profileId: string,
  viewerId: string,
  opts: { cursor?: string; limit: number }
) {
  const authorIds = await resolveWallAuthorIds(profileId)
  if (authorIds.length === 0) {
    return { data: [] as PostDto[], nextCursor: null as string | null }
  }

  const hasUnlock = await db.profileUnlock.findUnique({
    where: { userId_targetId: { userId: viewerId, targetId: profileId } },
  })

  const visibilityOr: Prisma.PostWhereInput[] = [
    { authorId: viewerId },
    { visibility: 'PUBLIC' },
  ]
  if (hasUnlock) {
    visibilityOr.push({ visibility: 'UNLOCKED_ONLY' })
  }

  const baseWhere: Prisma.PostWhereInput = {
    AND: [{ authorId: { in: authorIds } }, { OR: visibilityOr }],
  }

  let where: Prisma.PostWhereInput = baseWhere
  if (opts.cursor) {
    const { createdAt, id } = decodeCursor(opts.cursor)
    where = {
      AND: [
        baseWhere,
        {
          OR: [
            { createdAt: { lt: createdAt } },
            {
              AND: [
                { createdAt: { equals: createdAt } },
                { id: { lt: id } },
              ],
            },
          ],
        },
      ],
    }
  }

  const take = Math.min(opts.limit + 1, 51)
  const rows = await db.post.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take,
    include: postInclude,
  })

  const hasMore = rows.length > opts.limit
  const page = hasMore ? rows.slice(0, opts.limit) : rows
  const nextCursor =
    hasMore && page.length > 0
      ? encodeCursor(page[page.length - 1].createdAt, page[page.length - 1].id)
      : null

  return {
    data: page.map((p) => toPostDto(p, viewerId)),
    nextCursor,
  }
}

/** Whether viewer may read this post (timeline/wall rules, any wall context for unlock). */
export async function canViewerReadPost(
  post: PostLoaded,
  viewerId: string,
  unlocked: Set<string>
): Promise<boolean> {
  if (post.authorId === viewerId) return true
  if (post.visibility === 'PUBLIC') return true
  if (post.visibility === 'DRAFT') return false

  if (post.visibility === 'UNLOCKED_ONLY') {
    const ids = [
      post.author.profile?.id,
      post.author.coupleAsP1?.profileId,
      post.author.coupleAsP2?.profileId,
    ].filter(Boolean) as string[]
    return ids.some((pid) => unlocked.has(pid))
  }
  return false
}

export async function setReaction(
  app: FastifyInstance,
  viewerId: string,
  postId: string,
  type: ReactionType
) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: postInclude,
  })
  if (!post) {
    throw new HttpError('Post not found', 404)
  }
  const unlocked = await getUnlockedProfileIds(viewerId)
  if (!(await canViewerReadPost(post, viewerId, unlocked))) {
    throw new HttpError('Post not found', 404)
  }

  await db.postReaction.upsert({
    where: {
      postId_userId: { postId, userId: viewerId },
    },
    create: { postId, userId: viewerId, type },
    update: { type },
  })

  const updated = await db.post.findUnique({
    where: { id: postId },
    include: postInclude,
  })
  if (!updated) throw new HttpError('Post not found', 404)
  
  const dto = toPostDto(updated, viewerId)
  app.io.emit('post:reaction', { postId, reactionCounts: dto.reactionCounts })
  
  return dto
}

export async function removeReaction(app: FastifyInstance, viewerId: string, postId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: postInclude,
  })
  if (!post) {
    throw new HttpError('Post not found', 404)
  }
  const unlocked = await getUnlockedProfileIds(viewerId)
  if (!(await canViewerReadPost(post, viewerId, unlocked))) {
    throw new HttpError('Post not found', 404)
  }

  await db.postReaction.deleteMany({
    where: { postId, userId: viewerId },
  })

  const updated = await db.post.findUnique({
    where: { id: postId },
    include: postInclude,
  })
  if (!updated) throw new HttpError('Post not found', 404)
  
  const dto = toPostDto(updated, viewerId)
  app.io.emit('post:reaction', { postId, reactionCounts: dto.reactionCounts })
  
  return dto
}

export async function addComment(app: FastifyInstance, userId: string, postId: string, body: unknown) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: postInclude,
  })
  if (!post) throw new HttpError('Post not found', 404)
  
  const unlocked = await getUnlockedProfileIds(userId)
  if (!(await canViewerReadPost(post, userId, unlocked))) {
    throw new HttpError('Post not found', 404)
  }

  const parsed = CreateCommentSchema.safeParse(body)
  if (!parsed.success) {
    throw new HttpError(JSON.stringify(parsed.error.format()), 400)
  }

  const comment = await db.comment.create({
    data: {
      postId,
      userId,
      content: parsed.data.content,
    },
    include: {
      author: {
        include: {
          profile: { include: { photos: { orderBy: { order: 'asc' as const }, take: 1 } } },
        },
      },
    },
  })

  const count = await db.comment.count({ where: { postId } })
  const dto = toCommentDto(comment)
  
  app.io.emit('post:comment', { postId, commentCount: count, comment: dto })
  
  return dto
}

export async function listComments(postId: string, opts: { cursor?: string; limit: number }) {
  const take = Math.min(opts.limit + 1, 101)
  const where: Prisma.CommentWhereInput = { postId }
  
  if (opts.cursor) {
    where.id = { lt: opts.cursor }
  }

  const rows = await db.comment.findMany({
    where,
    orderBy: { id: 'desc' },
    take,
    include: {
      author: {
        include: {
          profile: { include: { photos: { orderBy: { order: 'asc' as const }, take: 1 } } },
        },
      },
    },
  })

  const hasMore = rows.length > opts.limit
  const data = hasMore ? rows.slice(0, opts.limit) : rows
  const nextCursor = hasMore && data.length > 0 ? data[data.length - 1].id : null

  return {
    data: data.map(toCommentDto),
    nextCursor,
  }
}
