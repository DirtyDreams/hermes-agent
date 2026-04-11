import { FastifyInstance } from 'fastify'
import { PostReactionBodySchema } from '@velvet/shared'
import {
  createPost,
  deletePost,
  HttpError,
  listTimeline,
  removeReaction,
  setReaction,
  updatePost,
} from './posts.service.js'

const writeRateLimit = {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  },
}

export default async function postsRoutes(app: FastifyInstance) {
  app.post(
    '/',
    { onRequest: [app.authenticate], ...writeRateLimit },
    async (request: any, reply) => {
      try {
        const data = await createPost(request.user.sub, request.body)
        return reply.send({ data })
      } catch (err: unknown) {
        if (err instanceof HttpError) {
          return reply.status(err.statusCode).send({ status: 'error', message: err.message })
        }
        throw err
      }
    }
  )

  app.patch(
    '/:id',
    { onRequest: [app.authenticate], ...writeRateLimit },
    async (request: any, reply) => {
      try {
        const { id } = request.params as { id: string }
        const data = await updatePost(request.user.sub, id, request.body)
        return reply.send({ data })
      } catch (err: unknown) {
        if (err instanceof HttpError) {
          return reply.status(err.statusCode).send({ status: 'error', message: err.message })
        }
        throw err
      }
    }
  )

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string }
      await deletePost(request.user.sub, id)
      return reply.status(204).send()
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      }
      throw err
    }
  })

  app.get('/timeline', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const q = request.query as { cursor?: string; limit?: string }
      let limit = q.limit ? parseInt(q.limit, 10) : 20
      if (Number.isNaN(limit) || limit < 1) limit = 20
      limit = Math.min(limit, 50)
      const result = await listTimeline(request.user.sub, {
        cursor: q.cursor,
        limit,
      })
      return reply.send(result)
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      }
      throw err
    }
  })

  app.post(
    '/:id/reactions',
    { onRequest: [app.authenticate], ...writeRateLimit },
    async (request: any, reply) => {
      try {
        const parsed = PostReactionBodySchema.safeParse(request.body)
        if (!parsed.success) {
          return reply.status(400).send({ status: 'error', errors: parsed.error.format() })
        }
        const { id } = request.params as { id: string }
        const data = await setReaction(request.user.sub, id, parsed.data.type)
        return reply.send({ data })
      } catch (err: unknown) {
        if (err instanceof HttpError) {
          return reply.status(err.statusCode).send({ status: 'error', message: err.message })
        }
        throw err
      }
    }
  )

  app.delete('/:id/reactions', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string }
      const data = await removeReaction(request.user.sub, id)
      return reply.send({ data })
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      }
      throw err
    }
  })
}
