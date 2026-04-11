import { describe, it, expect, beforeEach } from 'vitest'
import { buildApp } from '../app.js'
import { clearDatabase } from './test-utils.js'

describe('POST /api/v1/auth/register', () => {
  beforeEach(async () => {
    await clearDatabase()
  })

  it('creates a user and returns tokens', async () => {
    const app = buildApp()
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: 'test@example.com',
        password: 'Password123!',
        phone: '+15551234567',
        dateOfBirth: '1990-01-01T00:00:00.000Z',
        accountType: 'MAN',
        nickname: 'testuser',
        publicKey: 'test-public-key'
      },
    })
    
    // I will check for 404 first to confirm RED phase
    expect(response.statusCode).toBe(201)
  })

  it('rejects duplicate email', async () => {
    const app = buildApp()
    const payload = {
      email: 'duplicate@example.com',
      password: 'Password123!',
      phone: '+15551234567',
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      accountType: 'MAN',
      nickname: 'dupuser',
      publicKey: 'test-public-key'
    }
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload })
    const response = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload })
    expect(response.statusCode).toBe(409)
  })

  it('logs in a user and returns tokens', async () => {
    const app = buildApp()
    const payload = {
      email: 'login@example.com',
      password: 'Password123!',
      phone: '+15551234567',
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      accountType: 'MAN',
      nickname: 'loginuser',
      publicKey: 'test-public-key'
    }
    
    // Register first
    await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload })

    // Login
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: {
        email: payload.email,
        password: payload.password,
      },
    })

    expect(response.statusCode).toBe(200)
    const body = JSON.parse(response.body)
    expect(body).toHaveProperty('accessToken')
  })

  it('refreshes the access token', async () => {
    const app = buildApp()
    const payload = {
      email: 'refresh@example.com',
      password: 'Password123!',
      phone: '+15551234567',
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      accountType: 'MAN',
      nickname: 'refreshuser',
      publicKey: 'test-public-key'
    }
    
    const regResponse = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload })
    const cookies = regResponse.cookies
    const refreshToken = cookies.find(c => c.name === 'refreshToken')?.value

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      cookies: { refreshToken: refreshToken || '' }
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toHaveProperty('accessToken')
  })

  it('logs out and clears cookies', async () => {
    const app = buildApp()
    const payload = {
      email: 'logout@example.com',
      password: 'Password123!',
      phone: '+15551234567',
      dateOfBirth: '1990-01-01T00:00:00.000Z',
      accountType: 'MAN',
      nickname: 'logoutuser',
      publicKey: 'test-public-key'
    }
    
    const regResponse = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload })
    const refreshToken = regResponse.cookies.find(c => c.name === 'refreshToken')?.value

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { refreshToken: refreshToken || '' }
    })

    expect(response.statusCode).toBe(200)
    expect(response.cookies.find(c => c.name === 'refreshToken')?.value).toBe('')
  })
})
