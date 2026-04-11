import { FastifyInstance } from 'fastify'
import { UpdateProfileSchema } from '@velvet/shared'
import { getProfile, getProfileByUserId, updateProfile, unlockProfile } from './profiles.service.js'
import { generatePartnerInvite, acceptPartnerInvite } from './couple.service.js'

export default async function profileRoutes(app: FastifyInstance) {
  // ... (previous routes)
  app.get('/me', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const profile = await getProfileByUserId(request.user.sub)
      return reply.send(profile)
    } catch (err: any) {
      return reply.status(404).send({ status: 'error', message: 'Profile not found' })
    }
  })

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

  app.post('/partner/invite', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const result = await generatePartnerInvite(request.user.sub)
    return reply.send(result)
  })

  app.post('/partner/accept', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const { token } = request.body as { token: string }
      if (!token) return reply.status(400).send({ status: 'error', message: 'Token required' })
      const result = await acceptPartnerInvite(request.user.sub, token)
      return reply.send(result)
    } catch (err: any) {
      if (err.statusCode) return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      throw err
    }
  })

  app.post('/:id/unlock', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string }
      const res = await unlockProfile(request.user.sub, id)
      return reply.send({ status: 'success', data: res })
    } catch (err: any) {
      return reply.status(400).send({ status: 'error', message: err.message })
    }
  })

  app.get('/:id', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string }
      const profile = await getProfile(id)
      const { verificationPhoto, ...safe } = profile as any
      return reply.send(safe)
    } catch (err: any) {
      return reply.status(404).send({ status: 'error', message: 'Profile not found' })
    }
  })
}
