import { FastifyInstance } from 'fastify'
import { registerUser, loginUser, createSession } from './auth.service.js'
import { RegisterSchema, LoginSchema } from '@velvet/shared'
import { db } from '../../lib/db.js'
import crypto from 'node:crypto'

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const result = RegisterSchema.safeParse(request.body)
    if (!result.success) {
      return reply.code(400).send({ status: 'error', message: 'Invalid input', errors: result.error.format() })
    }

    try {
      const user = await registerUser(result.data)
      const refreshToken = await createSession(user.id, request.headers['user-agent'])
      
      const accessToken = app.jwt.sign({ sub: user.id })

      reply.setCookie('refreshToken', refreshToken, {
        path: '/api/v1/auth/refresh',
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
      const refreshToken = await createSession(user.id, request.headers['user-agent'])

      const accessToken = app.jwt.sign({ sub: user.id })

      reply.setCookie('refreshToken', refreshToken, {
        path: '/api/v1/auth/refresh',
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

  app.post('/refresh', async (request, reply) => {
    const token = request.cookies?.refreshToken
    if (!token) return reply.status(401).send({ status: 'error', message: 'No refresh token' })

    const session = await db.session.findUnique({
      where: { refreshToken: token },
      include: { user: true },
    })

    if (!session || session.expiresAt < new Date()) {
      return reply.status(401).send({ status: 'error', message: 'Invalid or expired refresh token' })
    }

    // Rotate refresh token
    const newRefreshToken = crypto.randomBytes(64).toString('hex')
    const newExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)

    await db.session.update({
      where: { id: session.id },
      data: { refreshToken: newRefreshToken, expiresAt: newExpiry },
    })

    const accessToken = app.jwt.sign({ sub: session.userId })

    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 30 * 24 * 60 * 60,
      path: '/api/v1/auth/refresh',
    })

    return reply.send({ accessToken })
  })

  app.post('/logout', async (request, reply) => {
    const token = request.cookies?.refreshToken
    if (token) {
      await db.session.deleteMany({ where: { refreshToken: token } })
    }
    reply.clearCookie('refreshToken', { path: '/api/v1/auth/refresh' })
    return reply.send({ status: 'success', message: 'Logged out' })
  })
}
