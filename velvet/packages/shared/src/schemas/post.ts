import { z } from 'zod'

export const PostVisibility = z.enum(['PUBLIC', 'UNLOCKED_ONLY', 'DRAFT'])
export type PostVisibility = z.infer<typeof PostVisibility>

export const ReactionType = z.enum(['LIKE', 'LOVE', 'WOW'])
export type ReactionType = z.infer<typeof ReactionType>

export const CreatePostSchema = z.object({
  content: z.string().max(8000),
  visibility: PostVisibility,
  mediaKeys: z.array(z.string()).max(4).optional().default([]),
})

export const UpdatePostSchema = z.object({
  content: z.string().max(8000).optional(),
  visibility: PostVisibility.optional(),
  mediaKeys: z.array(z.string()).max(4).optional(),
})

export const PostReactionBodySchema = z.object({
  type: ReactionType,
})

export function assertNonEmptyPost(content: string, mediaKeys: string[]) {
  const text = content.trim()
  if (text.length === 0 && mediaKeys.length === 0) {
    throw new Error('Post must have text or at least one media attachment')
  }
}
