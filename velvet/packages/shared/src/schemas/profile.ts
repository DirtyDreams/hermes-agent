import { z } from 'zod'

export const RelationshipStatus = z.enum([
  'single', 'couple', 'polycule', 'group'
])

export const ExperienceLevel = z.enum([
  'newcomer', 'explorer', 'experienced', 'veteran'
])

export const VibeType = z.enum(['like', 'pass', 'super_like'])

export const UpdateProfileSchema = z.object({
  displayName: z.string().min(2).max(20).optional(),
  bio: z.string().max(500).optional(),
  dateOfBirth: z.string().datetime().optional(),
  locationCity: z.string().max(100).optional(),
  relationshipStatus: RelationshipStatus.optional(),
  lookingFor: z.array(z.string()).optional(),
  experienceLevel: ExperienceLevel.optional(),
  lifestyleTags: z.array(z.string()).optional(),
  isCouple: z.boolean().optional(),
})

export const SendVibeSchema = z.object({
  targetId: z.string().uuid(),
  type: VibeType,
})

export type UpdateProfileInput = z.infer<typeof UpdateProfileSchema>
export type SendVibeInput = z.infer<typeof SendVibeSchema>
