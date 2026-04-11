import { redis } from '../../lib/redis'

export class PresenceService {
  private readonly PREFIX = 'presence:user:'
  private readonly DEFAULT_TTL = 60 // 60 seconds

  async setUserOnline(userId: string): Promise<void> {
    const key = `${this.PREFIX}${userId}`
    await redis.set(key, 'online', 'EX', this.DEFAULT_TTL)
  }

  async setUserOffline(userId: string): Promise<void> {
    const key = `${this.PREFIX}${userId}`
    await redis.del(key)
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const key = `${this.PREFIX}${userId}`
    const status = await redis.get(key)
    return status === 'online'
  }
}

export const presenceService = new PresenceService()
