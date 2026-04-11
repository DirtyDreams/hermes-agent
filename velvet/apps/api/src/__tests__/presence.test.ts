import { describe, it, expect, vi, beforeEach } from 'vitest'
import { presenceService } from '../modules/presence/presence.service'
import { redis } from '../lib/redis'

vi.mock('../lib/redis', () => ({
  redis: {
    set: vi.fn(),
    get: vi.fn(),
    expire: vi.fn(),
    del: vi.fn(),
  }
}))

describe('PresenceService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should set user online with correct TTL', async () => {
    const userId = 'user-1'
    await presenceService.setUserOnline(userId)

    expect(redis.set).toHaveBeenCalledWith(
      `presence:user:${userId}`,
      'online',
      'EX',
      60
    )
  })

  it('should mark user offline', async () => {
    const userId = 'user-1'
    await presenceService.setUserOffline(userId)

    expect(redis.del).toHaveBeenCalledWith(`presence:user:${userId}`)
  })

  it('should return true if user is online', async () => {
    const userId = 'user-1'
    vi.mocked(redis.get).mockResolvedValue('online')

    const result = await presenceService.isUserOnline(userId)
    expect(result).toBe(true)
    expect(redis.get).toHaveBeenCalledWith(`presence:user:${userId}`)
  })
})
