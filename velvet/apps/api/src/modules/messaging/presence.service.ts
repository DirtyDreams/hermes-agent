import { FastifyInstance } from 'fastify'

export class PresenceService {
  private redis
  private readonly PRESENCE_PREFIX = 'presence:user:'
  private readonly HEARTBEAT_TTL = 60 // 60 seconds

  constructor(fastify: FastifyInstance) {
    this.redis = fastify.redis
  }

  /**
   * Updates a user's presence status in Redis with a TTL.
   * This should be called on every socket heartbeat or activity.
   */
  async updatePresence(userId: string) {
    const key = `${this.PRESENCE_PREFIX}${userId}`
    await this.redis.set(key, 'online', 'EX', this.HEARTBEAT_TTL)
  }

  /**
   * Removes a user's presence status (e.g., on explicit logout/disconnect).
   */
  async removePresence(userId: string) {
    const key = `${this.PRESENCE_PREFIX}${userId}`
    await this.redis.del(key)
  }

  /**
   * Checks if a user is currently online.
   */
  async isOnline(userId: string): Promise<boolean> {
    const key = `${this.PRESENCE_PREFIX}${userId}`
    const result = await this.redis.get(key)
    return result === 'online'
  }

  /**
   * Retrieves presence status for a list of user IDs.
   * Useful for conversation lists.
   */
  async getPresenceMulti(userIds: string[]): Promise<Record<string, boolean>> {
    if (userIds.length === 0) return {}
    
    const keys = userIds.map(id => `${this.PRESENCE_PREFIX}${id}`)
    const results = await this.redis.mget(...keys)
    
    const presenceMap: Record<string, boolean> = {}
    userIds.forEach((id, index) => {
      presenceMap[id] = results[index] === 'online'
    })
    
    return presenceMap
  }
}
