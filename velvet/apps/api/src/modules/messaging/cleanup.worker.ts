import { db } from '../../lib/db'

export async function cleanupExpiredMessages() {
  const now = new Date()
  
  try {
    const result = await db.message.deleteMany({
      where: {
        expiresAt: {
          lt: now
        }
      }
    })
    
    // In a real production app we'd also delete linked media files from S3/R2 here
    // using the result.count or by fetching keys first.
    
    return result.count
  } catch (err) {
    console.error('Cleanup worker failed:', err)
    return 0
  }
}

// Start the worker interval (e.g., every hour)
export function startCleanupWorker(intervalMs: number = 3600000) {
  console.log('Starting Cleanup Worker...')
  setInterval(async () => {
    const count = await cleanupExpiredMessages()
    if (count > 0) {
      console.log(`[Cleanup] Pruned ${count} expired messages.`)
    }
  }, intervalMs)
}
