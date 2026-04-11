import type { FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { PostReactionBodySchema } from '@velvet/shared'
import {
  HttpError,
  createPost,
  deletePost,
  listTimeline,
  removeReaction,
  setReaction,
  updatePost,
} from './posts.service.js'

const rateCreate = {
  config: {
    rateLimit: {
      max: 30,
      timeWindow: '1 minute',
    },
  },
}

const rateReact = {
  config: {
    rateLimit: {
      max: 60,
      timeWindow: '1 minute',
    },
  },
}

export default async function postsRoutes(app: FastifyInstance) {
  // Static path before /:id so "timeline" is not captured as an id
  app.get('/timeline', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    const { cursor, limit } = request.query as { cursor?: string; limit?: string }
    const result = await listTimeline(request.user.sub, {
      cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
    })
    return reply.send(result)
  })

  app.post(
    '/',
    { onRequest: [app.authenticate], ...rateCreate },
    async (request: any, reply) => {
      try {
        const dto = await createPost(request.user.sub, request.body)
        return reply.status(201).send(dto)
      } catch (err: any) {
        if (err instanceof HttpError) {
          return reply.status(err.statusCode).send({ status: 'error', message: err.message })
        }
        if (err instanceof ZodError) {
          return reply.status(400).send({ status: 'error', errors: err.format() })
        }
        throw err
      }
    }
  )

  app.patch(
    '/:id',
    { onRequest: [app.authenticate], ...rateCreate },
    async (request: any, reply) => {
      try {
        const { id } = request.params as { id: string }
        const dto = await updatePost(request.user.sub, id, request.body)
        return reply.send(dto)
      } catch (err: any) {
        if (err instanceof HttpError) {
          return reply.status(err.statusCode).send({ status: 'error', message: err.message })
        }
        if (err instanceof ZodError) {
          return reply.status(400).send({ status: 'error', errors: err.format() })
        }
        throw err
      }
    }
  )

  app.delete('/:id', { onRequest: [app.authenticate] }, async (request: any, reply) => {
    try {
      const { id } = request.params as { id: string }
      await deletePost(request.user.sub, id)
      return reply.code(204).send()
    } catch (err: any) {
      if (err instanceof HttpError) {
        return reply.status(err.statusCode).send({ status: 'error', message: err.message })
      }
      throw err
    }
  })

  app.post(
    '/:id/reactions',
    { onRequest: [app.authenticate], ...rateReact },
    async (request: any, reply) => {
      try {
        const { id } = request.params as { id: string }
        const body = PostReactionBodySchema.parse(request.body)
        const dto = await setReaction(request.user.sub, id, body.type)
        return reply.send(dto)
      } catch (err: any) {
        if (err instanceof HttpError) {
          return reply.status(err.statusCode).send({ status: 'error', message: err.message })
        }
        if (err instanceof ZodError) {
          return reply.status(400).send({ status: 'error', errors: err.format() })
        }
        throw err
      }
    }
  )

  app.delete(
    '/:id/reactions',
    { onRequest: [app.authenticate], ...rateReact },
    async (request: any, reply) => {
      try {
        const { id } = request.params as { id: string }
        await removeReaction(request.user.sub, id)
        return reply.code(204).send()
      } catch (err: any) {
        if (err instanceof HttpError) {
          return reply.status(err.statusCode).send({ status: 'error', message: err.message })
        }
        throw err
      }
    }
  )
}
