import crypto from 'node:crypto'

const EMAIL_HMAC_SECRET = process.env.EMAIL_HMAC_SECRET || 'dev-secret-change-me'
const FUZZ_MILES = Number(process.env.LOCATION_FUZZ_MILES) || 25
const MILES_PER_DEGREE = 69.0

export function hashEmail(email: string): string {
  return crypto
    .createHmac('sha256', EMAIL_HMAC_SECRET)
    .update(email.toLowerCase().trim())
    .digest('hex')
}

export function verifyEmailHash(email: string, hash: string): boolean {
  return crypto.timingSafeEqual(
    Buffer.from(hashEmail(email)),
    Buffer.from(hash)
  )
}

export function fuzzLocation(lat: number, lng: number) {
  // Simple Box-Muller transform for normal distribution offsets
  const u1 = Math.random()
  const u2 = Math.random()
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2)
  
  // Convert miles to degrees (approximate)
  const latOffset = (z0 * FUZZ_MILES) / MILES_PER_DEGREE
  const lngOffset = (z0 * FUZZ_MILES) / (MILES_PER_DEGREE * Math.cos(lat * (Math.PI / 180)))

  return {
    lat: lat + latOffset,
    lng: lng + lngOffset,
  }
}
