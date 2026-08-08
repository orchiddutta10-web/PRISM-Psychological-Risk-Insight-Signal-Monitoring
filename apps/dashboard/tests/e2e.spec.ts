import { test, expect } from '@playwright/test';

test.describe('PRISM Dashboard E2E Navigation & Social Auth Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to ensure a clean login state
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
  });

  test('should load login page, toggle signup/signin modes, and authenticate via social login', async ({ page }) => {
    // 1. Verify we start on the login page with Sign In elements
    await expect(page.locator('h2')).toHaveText('Welcome back');
    await expect(page.locator('button[type="submit"]')).toContainText('Sign In');

    // 2. Toggle to "Sign Up" mode
    await page.getByRole('button', { name: 'Sign Up' }).click();
    await expect(page.locator('h2')).toHaveText('Create account');
    await expect(page.locator('button[type="submit"]')).toContainText('Create Account');
    
    // Verify "Full Name" and "Role" inputs are now visible
    await expect(page.getByPlaceholder('Your full name')).toBeVisible();
    await expect(page.locator('select')).toBeVisible();

    // 3. Toggle back to "Sign In" mode
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.locator('h2')).toHaveText('Welcome back');
    await expect(page.getByPlaceholder('Your full name')).not.toBeAttached();

    // 4. Perform Social Login (Google)
    // In our LoginPage, this registers a mock email/pass and logs in, redirecting to /overview
    await page.getByRole('button', { name: 'Google' }).click();

    // 5. Verify redirect to Overview page
    await page.waitForURL('**/overview');
    await expect(page).toHaveURL(/.*overview/);

    // 6. Verify dashboard shell + selected demo device
    await expect(page.locator('nav')).toContainText('PRISM');
    await expect(page.getByText(/Demo Teen|Simulator|Overview|Insight/i).first()).toBeVisible({ timeout: 15000 });

    // Verify local storage has token
    const token = await page.evaluate(() => localStorage.getItem('prism_token'));
    expect(token).not.toBeNull();
    expect(token?.length).toBeGreaterThan(10);
  });
});
