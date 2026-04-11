import { FastifyInstance } from 'fastify'
import { PostReactionBodySchema } from '@velvet/shared'
import {
  addComment,
  createPost,
  deletePost,
  HttpError,
  listComments,
  listTimeline,
  removeReaction,
  setReaction,
  updatePost,
} from './posts.service.js'

// @fastify/rate-limit reads per-route limits from routeOptions.config.rateLimit only (see plugin onRoute hook).
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
        const data = await createPost(app, request.user.sub, request.body)
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
        const data = await updatePost(app, request.user.sub, id, request.body)
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
      await deletePost(app, request.user.sub, id)
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
      const result = await listTimeline(app, request.user.sub, {
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
        const data = await setReaction(app, request.user.sub, id, parsed.data.type)
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
      const data = await removeReaction(app, request.user.sub, id)
      return reply.send({ data })
    } catch (err: unknown) {
      if (err instanceof HttpError) {
        return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      }
      throw err
    }
  })
  app.post(
    '/:id/comments',
    { onRequest: [app.authenticate], ...writeRateLimit },
    async (request: any, reply) => {
      try {
        const { id } = request.params as { id: string }
        const data = await addComment(app, request.user.sub, id, request.body)
        return reply.send({ data })
      } catch (err: unknown) {
        if (err instanceof HttpError) {
          return reply.status(err.statusCode).send({ status: 'error', message: err.message })
        }
        throw err
      }
    }
  )

  app.get('/:id/comments', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string }
      const q = request.query as { cursor?: string; limit?: string }
      let limit = q.limit ? parseInt(q.limit, 10) : 20
      if (Number.isNaN(limit) || limit < 1) limit = 20
      limit = Math.min(limit, 100)
      const result = await listComments(id, {
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
}
