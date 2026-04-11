import type { Prisma } from '@prisma/client'
import {
  CreatePostSchema,
  UpdatePostSchema,
  assertNonEmptyPost,
  type ReactionType,
} from '@velvet/shared'
import { db } from '../../lib/db.js'
import { getPublicUrl } from '../../lib/storage.js'

export class HttpError extends Error {
  statusCode: number
  constructor(statusCode: number, message: string) {
    super(message)
    this.statusCode = statusCode
  }
}

const MAX_MEDIA = 4
const POST_MEDIA_PREFIX = (userId: string) => `POST_MEDIA/${userId}/`

export function validateMediaKeys(authorId: string, keys: string[]) {
  if (keys.length > MAX_MEDIA) {
    throw new HttpError(400, `At most ${MAX_MEDIA} media attachments allowed`)
  }
  const prefix = POST_MEDIA_PREFIX(authorId)
  for (const key of keys) {
    if (!key.startsWith(prefix)) {
      throw new HttpError(400, 'Invalid media key for this user')
    }
  }
}

export async function getUnlockedProfileIds(viewerId: string): Promise<Set<string>> {
  const rows = await db.profileUnlock.findMany({
    where: { userId: viewerId },
    select: { targetId: true },
  })
  return new Set(rows.map((r) => r.targetId))
}

type AuthorWithWall = {
  id: string
  profile: {
    id: string
    nickname: string | null
    displayName: string | null
    bannerUrl: string | null
    photos: { cdnUrl: string }[]
  } | null
  coupleAsP1: { profileId: string | null } | null
  coupleAsP2: { profileId: string | null } | null
}

function wallProfileIdsForAuthor(author: AuthorWithWall): Set<string> {
  const s = new Set<string>()
  if (author.profile?.id) s.add(author.profile.id)
  if (author.coupleAsP1?.profileId) s.add(author.coupleAsP1.profileId)
  if (author.coupleAsP2?.profileId) s.add(author.coupleAsP2.profileId)
  return s
}

export function timelineWhereForViewer(
  viewerId: string,
  unlocked: Set<string>
): Prisma.PostWhereInput {
  const unlockedArr = [...unlocked]
  const orBranches: Prisma.PostWhereInput[] = [
    { authorId: viewerId },
    { visibility: 'PUBLIC' },
  ]
  if (unlockedArr.length > 0) {
    orBranches.push({
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
  return { OR: orBranches }
}

const postListInclude = {
  author: {
    include: {
      profile: {
        include: {
          photos: { orderBy: { order: 'asc' as const }, take: 1 },
        },
      },
      coupleAsP1: true,
      coupleAsP2: true,
    },
  },
  reactions: true,
} satisfies Prisma.PostInclude

type PostList = Prisma.PostGetPayload<{ include: typeof postListInclude }>

export async function canReadPostInTimeline(
  viewerId: string,
  post: { authorId: string; visibility: string; author: AuthorWithWall }
): Promise<boolean> {
  if (post.authorId === viewerId) return true
  if (post.visibility === 'DRAFT') return false
  if (post.visibility === 'PUBLIC') return true
  if (post.visibility === 'UNLOCKED_ONLY') {
    const unlocked = await getUnlockedProfileIds(viewerId)
    for (const id of wallProfileIdsForAuthor(post.author)) {
      if (unlocked.has(id)) return true
    }
    return false
  }
  return false
}

export function toPostDto(post: PostList, viewerId: string) {
  const profile = post.author.profile
  const avatarUrl = profile?.photos?.[0]?.cdnUrl ?? profile?.bannerUrl ?? null
  const counts = { LIKE: 0, LOVE: 0, WOW: 0 } as Record<ReactionType, number>
  let viewerReaction: ReactionType | null = null
  for (const r of post.reactions) {
    const t = r.type as ReactionType
    if (t in counts) counts[t] += 1
    if (r.userId === viewerId) viewerReaction = t
  }
  return {
    id: post.id,
    content: post.content,
    visibility: post.visibility,
    mediaKeys: post.mediaKeys,
    mediaUrls: post.mediaKeys.map((k) => getPublicUrl(k)),
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
    authorId: post.authorId,
    author: {
      id: post.author.id,
      nickname: profile?.nickname ?? null,
      displayName: profile?.displayName ?? null,
      avatarUrl,
    },
    reactionCounts: { like: counts.LIKE, love: counts.LOVE, wow: counts.WOW },
    viewerReaction,
  }
}

export async function createPost(userId: string, body: unknown) {
  const input = CreatePostSchema.parse(body)
  try {
    assertNonEmptyPost(input.content, input.mediaKeys)
  } catch (e) {
    if (e instanceof Error) throw new HttpError(400, e.message)
    throw e
  }
  validateMediaKeys(userId, input.mediaKeys)
  const post = await db.post.create({
    data: {
      authorId: userId,
      content: input.content.trim(),
      visibility: input.visibility,
      mediaKeys: input.mediaKeys,
    },
    include: postListInclude,
  })
  return toPostDto(post, userId)
}

export async function updatePost(userId: string, postId: string, body: unknown) {
  const existing = await db.post.findUnique({ where: { id: postId } })
  if (!existing || existing.authorId !== userId) {
    throw new HttpError(404, 'Post not found')
  }
  const input = UpdatePostSchema.parse(body)
  if (
    input.content === undefined &&
    input.visibility === undefined &&
    input.mediaKeys === undefined
  ) {
    throw new HttpError(400, 'No fields to update')
  }
  const content = input.content !== undefined ? input.content.trim() : existing.content
  const visibility = input.visibility ?? existing.visibility
  const mediaKeys = input.mediaKeys ?? existing.mediaKeys
  try {
    assertNonEmptyPost(content, mediaKeys)
  } catch (e) {
    if (e instanceof Error) throw new HttpError(400, e.message)
    throw e
  }
  validateMediaKeys(userId, mediaKeys)
  const post = await db.post.update({
    where: { id: postId },
    data: { content, visibility, mediaKeys },
    include: postListInclude,
  })
  return toPostDto(post, userId)
}

export async function deletePost(userId: string, postId: string) {
  const existing = await db.post.findUnique({ where: { id: postId } })
  if (!existing || existing.authorId !== userId) {
    throw new HttpError(404, 'Post not found')
  }
  await db.post.delete({ where: { id: postId } })
}

export async function listTimeline(
  viewerId: string,
  opts: { cursor?: string; limit?: number }
) {
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const unlocked = await getUnlockedProfileIds(viewerId)
  const baseWhere = timelineWhereForViewer(viewerId, unlocked)

  let cursorWhere: Prisma.PostWhereInput = {}
  if (opts.cursor) {
    const cur = await db.post.findUnique({ where: { id: opts.cursor } })
    if (cur) {
      cursorWhere = {
        OR: [
          { createdAt: { lt: cur.createdAt } },
          { AND: [{ createdAt: cur.createdAt }, { id: { lt: cur.id } }] },
        ],
      }
    }
  }

  const posts = await db.post.findMany({
    where: { AND: [baseWhere, cursorWhere] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: postListInclude,
  })

  let nextCursor: string | undefined
  if (posts.length > limit) {
    const last = posts.pop()!
    nextCursor = last.id
  }
  return {
    data: posts.map((p) => toPostDto(p, viewerId)),
    nextCursor,
  }
}

async function resolveWallAuthorIds(profileId: string): Promise<string[]> {
  const profile = await db.profile.findUnique({ where: { id: profileId } })
  if (!profile) {
    throw new HttpError(404, 'Profile not found')
  }
  if (profile.userId) {
    return [profile.userId]
  }
  const couple = await db.couple.findFirst({ where: { profileId } })
  if (!couple) {
    throw new HttpError(404, 'Profile not found')
  }
  return [couple.partner1Id, couple.partner2Id].filter(Boolean) as string[]
}

export async function listPostsForProfile(
  profileId: string,
  viewerId: string,
  opts: { cursor?: string; limit?: number }
) {
  const authorIds = await resolveWallAuthorIds(profileId)
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50)
  const unlocked = await getUnlockedProfileIds(viewerId)

  const wallWhere: Prisma.PostWhereInput = {
    AND: [
      { authorId: { in: authorIds } },
      {
        OR: [
          { authorId: viewerId },
          { visibility: 'PUBLIC' },
          ...(unlocked.has(profileId) ? ([{ visibility: 'UNLOCKED_ONLY' }] as const) : []),
        ],
      },
    ],
  }

  let cursorWhere: Prisma.PostWhereInput = {}
  if (opts.cursor) {
    const cur = await db.post.findUnique({ where: { id: opts.cursor } })
    if (cur) {
      cursorWhere = {
        OR: [
          { createdAt: { lt: cur.createdAt } },
          { AND: [{ createdAt: cur.createdAt }, { id: { lt: cur.id } }] },
        ],
      }
    }
  }

  const posts = await db.post.findMany({
    where: { AND: [wallWhere, cursorWhere] },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: postListInclude,
  })

  let nextCursor: string | undefined
  if (posts.length > limit) {
    const last = posts.pop()!
    nextCursor = last.id
  }
  return {
    data: posts.map((p) => toPostDto(p, viewerId)),
    nextCursor,
  }
}

async function loadPostForAuth(postId: string, viewerId: string) {
  const post = await db.post.findUnique({
    where: { id: postId },
    include: postListInclude,
  })
  if (!post) {
    throw new HttpError(404, 'Post not found')
  }
  const ok = await canReadPostInTimeline(viewerId, {
    authorId: post.authorId,
    visibility: post.visibility,
    author: post.author as AuthorWithWall,
  })
  if (!ok) {
    throw new HttpError(404, 'Post not found')
  }
  return post
}

export async function setReaction(viewerId: string, postId: string, type: ReactionType) {
  await loadPostForAuth(postId, viewerId)
  const existing = await db.postReaction.findFirst({
    where: { postId, userId: viewerId },
  })
  if (existing) {
    await db.postReaction.update({
      where: { id: existing.id },
      data: { type },
    })
  } else {
    await db.postReaction.create({
      data: { postId, userId: viewerId, type },
    })
  }
  const post = await db.post.findUnique({
    where: { id: postId },
    include: postListInclude,
  })
  return toPostDto(post!, viewerId)
}

export async function removeReaction(viewerId: string, postId: string) {
  await loadPostForAuth(postId, viewerId)
  await db.postReaction.deleteMany({ where: { postId, userId: viewerId } })
}
