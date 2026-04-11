import { describe, it, expect } from 'vitest'
import { buildApp } from '../app.js'

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = buildApp()
    const response = await app.inject({ method: 'GET', url: '/health' })
    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toMatchObject({ status: 'ok' })
  })
})
