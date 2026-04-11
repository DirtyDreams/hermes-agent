import { FastifyInstance } from 'fastify'
import { getCreditBalance, getTransactionHistory } from './economy.service.js'

export default async function (app: FastifyInstance) {
  app.addHook('preHandler', app.authenticate)

  app.get('/balance', async (request, reply) => {
    const userId = (request.user as any).sub
    const balance = await getCreditBalance(userId)
    return { balance }
  })

  app.get('/transactions', async (request, reply) => {
    const userId = (request.user as any).sub
    const history = await getTransactionHistory(userId)
    return history
  })
}
