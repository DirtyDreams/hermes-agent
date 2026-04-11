import { test, expect } from '@playwright/test'

test.describe('Velvet Critical Path', () => {
  const testEmail = `test+${Date.now()}@example.com`

  test('user can register and see onboarding', async ({ page }) => {
    await page.goto('/register')
    
    // Check if we are on the register page
    await expect(page).toHaveTitle(/Velvet/)
    
    await page.fill('[data-testid="email"]', testEmail)
    await page.fill('[data-testid="phone"]', '+15551234567')
    await page.fill('[data-testid="password"]', 'Password123!')
    await page.fill('[data-testid="dob"]', '1995-01-01')
    
    await page.click('button[type="submit"]')
    
    // Should be redirected to onboarding
    await expect(page).toHaveURL(/.*onboarding/)
    
    // Step 1: Privacy Education
    await expect(page.getByText('Privacy First')).toBeVisible()
    await page.click('button:has-text("I understand")')
    
    // Step 2: Photo Upload
    await expect(page.getByText('Upload blurred profile photo')).toBeVisible()
    // We skip the actual upload in this E2E test for now or use a mock file
    await page.click('button:has-text("Continue")')
    
    // Step 3: Profile Details
    await expect(page.getByText('Complete your profile')).toBeVisible()
    await page.fill('input[placeholder*="How should others"]', 'Test User')
    await page.fill('textarea[placeholder*="What sets you apart"]', 'This is a test bio for E2E verification.')
    
    await page.click('button:has-text("Enter Velvet")')
    
    // Should reach the feed
    await expect(page).toHaveURL(/\/$/) // Base URL
  })
})
