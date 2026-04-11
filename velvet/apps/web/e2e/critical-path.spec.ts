import { test, expect } from '@playwright/test'

test.describe('Velvet Critical Path', () => {
  const testEmail = `test+${Date.now()}@example.com`
  const testNickname = `tester${Math.floor(Math.random() * 10000)}`

  test('user can register, complete onboarding, and navigate profile', async ({ page }) => {
    // 1. Start Registration
    await page.goto('/register')
    await expect(page).toHaveTitle(/Velvet/)
    
    // Step 1: Identity
    await page.selectOption('[data-testid="account-type-select"]', 'MAN')
    await page.fill('[data-testid="nickname-input"]', testNickname)
    await page.click('[data-testid="identity-submit"]')
    
    // Step 2: Details
    await expect(page.getByText('Basic Info')).toBeVisible()
    await page.fill('[data-testid="email-input"]', testEmail)
    await page.fill('[data-testid="phone-input"]', '+15551234567')
    await page.fill('[data-testid="password-input"]', 'Password123!')
    await page.fill('[data-testid="dob-input"]', '1995-01-01')
    await page.click('[data-testid="details-submit"]')
    
    // Step 3: Security Shield
    await expect(page.getByText('Initializing Shield')).toBeVisible()
    // Wait for RSA key generation and "Join" button
    const joinBtn = page.locator('[data-testid="final-register-submit"]')
    await expect(joinBtn).toBeVisible({ timeout: 10000 })
    await joinBtn.click()
    
    // 2. Onboarding
    await expect(page).toHaveURL(/.*onboarding/)
    
    // Step 1: Privacy Education
    await expect(page.getByText('Privacy First')).toBeVisible()
    await page.click('[data-testid="onboarding-understand-btn"]')
    
    // Step 2: Photo Upload (Skip)
    await expect(page.getByText('Upload blurred profile photo')).toBeVisible()
    await page.click('[data-testid="onboarding-continue-btn"]')
    
    // Step 3: Profile Details
    await expect(page.getByText('Complete your profile')).toBeVisible()
    await page.fill('[data-testid="display-name-input"]', 'E2E Tester')
    await page.fill('[data-testid="age-input"]', '28')
    await page.fill('[data-testid="bio-textarea"]', 'Automated test bio.')
    await page.click('[data-testid="onboarding-finish-btn"]')
    
    // 3. Navigation & Profile Tabs
    await expect(page).toHaveURL(/\//) // Home timeline

    const profileId = await page.evaluate(async () => {
      const token = sessionStorage.getItem('velvet_access_token')
      const r = await fetch('http://localhost:3000/api/v1/profiles/me', {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!r.ok) return null
      const j = await r.json()
      return j.id as string
    })
    expect(profileId).toBeTruthy()

    await expect(page.locator('[data-testid="timeline-root"]')).toBeVisible()

    await page.goto(`/profile/${profileId}`)
    await expect(page.getByText('E2E Tester')).toBeVisible()

    const tabs = ['WALL', 'ABOUT', 'PHOTOS', 'VIDEOS', 'FRIENDS']
    for (const tab of tabs) {
      const tabBtn = page.locator(`[data-testid="profile-tab-${tab}"]`)
      await tabBtn.click()
      await page.waitForTimeout(300)
    }

    await page.locator('[data-testid="profile-tab-ABOUT"]').click()
    await expect(page.getByText('Automated test bio.')).toBeVisible()
  })
})
