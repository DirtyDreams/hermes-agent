import { test, expect } from '@playwright/test'

test.describe('Velvet Critical Path', () => {
  const testEmail = `test+${Date.now()}@example.com`
  const testNickname = `tester${Math.floor(Math.random() * 10000)}`

  test('user can register, complete onboarding, and navigate profile', async ({ page }) => {
    await page.goto('/register')
    await expect(page).toHaveTitle(/Velvet/)

    await page.selectOption('[data-testid="account-type-select"]', 'MAN')
    await page.fill('[data-testid="nickname-input"]', testNickname)
    await page.click('[data-testid="identity-submit"]')

    await expect(page.getByText('Basic Info')).toBeVisible()
    await page.fill('[data-testid="email-input"]', testEmail)
    await page.fill('[data-testid="phone-input"]', '+15551234567')
    await page.fill('[data-testid="password-input"]', 'Password123!')
    await page.fill('[data-testid="dob-input"]', '1995-01-01')
    await page.click('[data-testid="details-submit"]')

    await expect(page.getByText('Initializing Shield')).toBeVisible()
    const joinBtn = page.locator('[data-testid="final-register-submit"]')
    await expect(joinBtn).toBeVisible({ timeout: 10000 })
    await joinBtn.click()

    await expect(page).toHaveURL(/.*onboarding/)

    await expect(page.getByText('Privacy First')).toBeVisible()
    await page.click('[data-testid="onboarding-understand-btn"]')

    await expect(page.getByText('Upload blurred profile photo')).toBeVisible()
    await page.click('[data-testid="onboarding-continue-btn"]')

    await expect(page.getByText('Complete your profile')).toBeVisible()
    await page.fill('[data-testid="display-name-input"]', 'E2E Tester')
    await page.fill('[data-testid="age-input"]', '28')
    await page.fill('[data-testid="bio-textarea"]', 'Automated test bio.')
    await page.click('[data-testid="onboarding-finish-btn"]')

    await expect(page).toHaveURL(/\//)
    await expect(page.locator('[data-testid="timeline-root"]')).toBeVisible()

    const token = await page.evaluate(() => sessionStorage.getItem('velvet_access_token'))
    expect(token).toBeTruthy()
    const profRes = await page.request.get('http://localhost:3000/api/v1/profiles/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    expect(profRes.ok()).toBeTruthy()
    const me = (await profRes.json()) as { id: string }
    await page.goto(`/profile/${me.id}`)
    await expect(page.getByText('E2E Tester')).toBeVisible()

    const tabs = ['WALL', 'ABOUT', 'PHOTOS', 'VIDEOS', 'FRIENDS']
    for (const tab of tabs) {
      await page.locator(`[data-testid="profile-tab-${tab}"]`).click()
      await expect(page.locator(`[data-testid="profile-tab-${tab}"]`)).toBeVisible()
    }

    await page.locator('[data-testid="profile-tab-ABOUT"]').click()
    await expect(page.getByText('Automated test bio.')).toBeVisible()
  })
})
