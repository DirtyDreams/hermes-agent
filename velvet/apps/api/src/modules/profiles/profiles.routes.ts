import { FastifyInstance } from 'fastify'
import { UpdateProfileSchema } from '@velvet/shared'
import { getProfile, getProfileByUserId, updateProfile } from './profiles.service.js'

export default async function profileRoutes(app: FastifyInstance) {
  // Get own profile
  app.get('/me', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const profile = await getProfileByUserId(request.user.sub)
      return reply.send(profile)
    } catch (err: any) {
      return reply.status(404).send({ status: 'error', message: 'Profile not found' })
    }
  })

  // Update own profile
  app.patch('/me', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const result = UpdateProfileSchema.safeParse(request.body)
      if (!result.success) {
        return reply.status(400).send({ status: 'error', errors: result.error.format() })
      }
      const profile = await updateProfile(request.user.sub, result.data)
      return reply.send(profile)
    } catch (err: any) {
      return reply.status(500).send({ status: 'error', message: err.message })
    }
  })

  // View any profile by ID (public fields only)
  app.get('/:id', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string }
      const profile = await getProfile(id)
      // Return only public-safe fields (MVP logic: exclude sensitive metadata)
      const { verificationPhoto, ...safe } = profile as any
      return reply.send(safe)
    } catch (err: any) {
      return reply.status(404).send({ status: 'error', message: 'Profile not found' })
    }
  })
}
