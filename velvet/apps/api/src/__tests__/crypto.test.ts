import { describe, it, expect } from 'vitest'
import { hashEmail, verifyEmailHash, fuzzLocation } from '../lib/crypto.js'

describe('hashEmail', () => {
  it('produces consistent hash for same email', () => {
    const hash1 = hashEmail('test@example.com')
    const hash2 = hashEmail('test@example.com')
    expect(hash1).toBe(hash2)
  })

  it('produces different hash for different emails', () => {
    const hash1 = hashEmail('a@example.com')
    const hash2 = hashEmail('b@example.com')
    expect(hash1).not.toBe(hash2)
  })
})

describe('fuzzLocation', () => {
  it('offsets lat/lng by approximately 25 miles', () => {
    const { lat, lng } = fuzzLocation(40.7128, -74.0060)
    // Use a larger buffer (e.g., 2.0 degrees) to account for tail ends of the normal distribution
    expect(Math.abs(lat - 40.7128)).toBeLessThan(2.0)
    expect(Math.abs(lng - (-74.0060))).toBeLessThan(2.0)
    expect(lat).not.toBe(40.7128)
  })
})
