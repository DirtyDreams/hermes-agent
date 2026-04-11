import { z } from 'zod'

export const MediaPurpose = z.enum([
  'PROFILE_PICTURE',
  'IDENTITY_VERIFICATION',
  'MESSAGE_ATTACHMENT',
  'POST_MEDIA'
])

export type MediaPurpose = z.infer<typeof MediaPurpose>

export interface MediaMetadata {
  id: string
  url: string
  purpose: MediaPurpose
  mimeType: string
  size: number
  width?: number
  height?: number
  isBlurred: boolean
  createdAt: string
}

export const UploadPresignedUrlSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  purpose: MediaPurpose,
})

export type UploadPresignedUrlInput = z.infer<typeof UploadPresignedUrlSchema>
