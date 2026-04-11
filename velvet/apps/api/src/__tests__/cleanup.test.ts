import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanupExpiredMessages } from '../modules/messaging/cleanup.worker'
import { db } from '../lib/db'

vi.mock('../lib/db', () => ({
  db: {
    message: {
      deleteMany: vi.fn(),
      findMany: vi.fn(),
      updateMany: vi.fn(),
    }
  }
}))

describe('CleanupWorker', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  it('should delete messages past expiresAt', async () => {
    const mockNow = new Date('2026-04-11T12:00:00Z')
    vi.setSystemTime(mockNow)

    await cleanupExpiredMessages()

    expect(db.message.deleteMany).toHaveBeenCalledWith({
      where: {
        expiresAt: {
          lt: mockNow
        }
      }
    })
  })

  it('should mark ephemeral messages for deletion if read', async () => {
    // This is a variation: maybe we want to delete ephemeral messages 10s after readAt
    // But the task says "24h cleanup" and "auto-deletion".
    // I'll implement the 24h cleanup strictly first.
  })
})
