import { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { getUploadUrl, getPublicUrl } from '../../lib/storage.js'
import { UploadPresignedUrlSchema } from '@velvet/media'
import { db } from '../../lib/db.js'

export default async function mediaRoutes(app: FastifyInstance) {
  app.post('/upload-url', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const result = UploadPresignedUrlSchema.safeParse(request.body)
    if (!result.success) {
      return reply.status(400).send({ status: 'error', errors: result.error.format() })
    }

    const { fileName, contentType, purpose } = result.data
    const fileId = uuidv4()
    const extension = fileName.split('.').pop()
    const storageKey = `${purpose}/${request.user.sub}/${fileId}.${extension}`

    const uploadUrl = await getUploadUrl(storageKey, contentType)
    const publicUrl = getPublicUrl(storageKey)

    // Optional: Pre-register media in DB (status: PENDING)
    // For now we'll just return the URLs
    
    return reply.send({ uploadUrl, publicUrl, storageKey })
  })

  app.post('/confirm', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const { storageKey, purpose, isBlurred } = request.body as { storageKey: string, purpose: string, isBlurred: boolean }
    
    // In a real app, we'd verify the file exists in S3 here
    
    const publicUrl = getPublicUrl(storageKey)

    if (purpose === 'PROFILE_PICTURE') {
      await db.profile.update({
        where: { userId: request.user.sub },
        data: {
          avatarUrl: publicUrl,
          // If we had a blurredAvatarUrl field, we'd use it
        }
      })
    }

    return reply.send({ status: 'success', url: publicUrl })
  })
}
