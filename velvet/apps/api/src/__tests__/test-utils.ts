import { db } from '../lib/db.js'

/**
 * Clears all data from the database in the correct order to respect foreign key constraints.
 * Use this in beforeEach hooks to ensure a clean slate for each test.
 */
export async function clearDatabase() {
  // Delete in order of dependency (children first)
  // Use defensive checks in case the Prisma client is stale/locking
  if (db.postReaction) await db.postReaction.deleteMany()
  if (db.post) await db.post.deleteMany()
  if (db.message) await db.message.deleteMany()
  if (db.conversation) await db.conversation.deleteMany()
  if (db.match) await db.match.deleteMany()
  if (db.vibe) await db.vibe.deleteMany()
  if (db.profileUnlock) await db.profileUnlock.deleteMany()
  if (db.creditTransaction) await db.creditTransaction.deleteMany()
  if (db.session) await db.session.deleteMany()
  if (db.mediaFile) await db.mediaFile.deleteMany()
  if (db.couple) await db.couple.deleteMany()
  if (db.profile) await db.profile.deleteMany()
  if (db.user) await db.user.deleteMany()
  if (db.event) await db.event.deleteMany()
}
