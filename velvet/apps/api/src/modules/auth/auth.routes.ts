import { FastifyInstance } from 'fastify'
import { registerUser, loginUser, createSession } from './auth.service.js'
import { RegisterSchema, LoginSchema } from '@velvet/shared'

export default async function authRoutes(app: FastifyInstance) {
  // ... register route ... (keeping it)
  app.post('/register', async (request, reply) => {
    // ...
    const result = RegisterSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ status: 'error', message: 'Invalid input', errors: result.error.format() })
    }

    try {
      const user = await registerUser(result.data)
      const refreshToken = await createSession(user.id)
      
      const accessToken = app.jwt.sign({ sub: user.id })

      reply.setCookie('refreshToken', refreshToken, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60
      })

      return reply.code(201).send({ accessToken, user })
    } catch (err: any) {
      const statusCode = err.statusCode || 500
      return reply.code(statusCode).send({ status: 'error', message: err.message })
    }
  })

  app.post('/login', async (request, reply) => {
    const result = LoginSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ status: 'error', message: 'Invalid input' })
    }

    try {
      const user = await loginUser(result.data)
      const refreshToken = await createSession(user.id)

      const accessToken = app.jwt.sign({ sub: user.id })

      reply.setCookie('refreshToken', refreshToken, {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 30 * 24 * 60 * 60
      })

      return reply.send({ accessToken, user: { id: user.id } })
    } catch (err: any) {
      const statusCode = err.statusCode || 500
      return reply.code(statusCode).send({ status: 'error', message: err.message })
    }
  })
}
