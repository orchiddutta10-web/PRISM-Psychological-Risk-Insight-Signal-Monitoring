# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.ts >> PRISM Dashboard E2E Navigation & Social Auth Flow >> should load login page, toggle signup/signin modes, and authenticate via social login
- Location: tests\e2e.spec.ts:11:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "**/overview" until "load"
============================================================
```

# Page snapshot

```yaml
- generic [active] [ref=f1e1]:
  - generic [ref=f1e2]:
    - generic [ref=f1e3]:
      - generic [ref=f1e11]:
        - generic [ref=f1e12]: PRISM
        - generic [ref=f1e16]:
          - paragraph [ref=f1e17]: Intelligent command center
          - heading "Protecting their future, transparently." [level=1] [ref=f1e19]: Protectingtheir future,transparently.
          - paragraph [ref=f1e20]: Behavior patterns, encrypted sleep signals, and real-time insights, delivered with absolute privacy.
      - generic [ref=f1e21]:
        - generic [ref=f1e22]: Metadata only, zero message content ever read.
        - generic [ref=f1e25]: Teen can pause monitoring at any time.
        - generic [ref=f1e28]: End-to-end encrypted data transmission.
    - main [ref=f1e31]:
      - generic [ref=f1e32]:
        - generic [ref=f1e33]:
          - paragraph [ref=f1e34]: Guardian access
          - heading "Welcome back" [level=2] [ref=f1e35]
          - paragraph [ref=f1e36]: Sign in to access your secure guardian dashboard.
        - generic [ref=f1e37]: Something went wrong
        - generic [ref=f1e40]:
          - generic [ref=f1e41]:
            - generic [ref=f1e42]: Email address
            - textbox "name@example.com" [ref=f1e44]
          - generic [ref=f1e45]:
            - generic [ref=f1e46]: Password
            - generic [ref=f1e47]:
              - textbox "••••••••" [ref=f1e48]
              - button "Show password" [ref=f1e49] [cursor=pointer]
          - button "Sign In" [ref=f1e53] [cursor=pointer]
        - generic [ref=f1e56]: or continue with
        - generic [ref=f1e60]:
          - button "G Google" [ref=f1e61] [cursor=pointer]:
            - generic [ref=f1e62]: G
            - generic [ref=f1e63]: Google
          - button "● Apple" [ref=f1e64] [cursor=pointer]:
            - generic [ref=f1e65]: ●
            - generic [ref=f1e66]: Apple
        - paragraph [ref=f1e67]:
          - text: Don't have an account?
          - button "Sign Up" [ref=f1e68] [cursor=pointer]
  - alert [ref=f1e69]
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('PRISM Dashboard E2E Navigation & Social Auth Flow', () => {
  4  |   test.beforeEach(async ({ page }) => {
  5  |     // Clear localStorage to ensure a clean login state
  6  |     await page.goto('/');
  7  |     await page.evaluate(() => localStorage.clear());
  8  |     await page.goto('/');
  9  |   });
  10 | 
  11 |   test('should load login page, toggle signup/signin modes, and authenticate via social login', async ({ page }) => {
  12 |     // 1. Verify we start on the login page with Sign In elements
  13 |     await expect(page.locator('h2')).toHaveText('Welcome back');
  14 |     await expect(page.locator('button[type="submit"]')).toContainText('Sign In');
  15 | 
  16 |     // 2. Toggle to "Sign Up" mode
  17 |     await page.getByRole('button', { name: 'Sign Up' }).click();
  18 |     await expect(page.locator('h2')).toHaveText('Create an account');
  19 |     await expect(page.locator('button[type="submit"]')).toContainText('Create Account');
  20 |     
  21 |     // Verify "Full Name" and "Role" inputs are now visible
  22 |     await expect(page.getByPlaceholder('Your full name')).toBeVisible();
  23 |     await expect(page.locator('select')).toBeVisible();
  24 | 
  25 |     // 3. Toggle back to "Sign In" mode
  26 |     await page.getByRole('button', { name: 'Sign In' }).click();
  27 |     await expect(page.locator('h2')).toHaveText('Welcome back');
  28 |     await expect(page.getByPlaceholder('Your full name')).not.toBeAttached();
  29 | 
  30 |     // 4. Perform Social Login (Google)
  31 |     // In our LoginPage, this registers a mock email/pass and logs in, redirecting to /overview
  32 |     await page.getByRole('button', { name: 'Google' }).click();
  33 | 
  34 |     // 5. Verify redirect to Overview page
> 35 |     await page.waitForURL('**/overview');
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  36 |     await expect(page).toHaveURL(/.*overview/);
  37 | 
  38 |     // 6. Verify dashboard shell + selected demo device
  39 |     await expect(page.locator('nav')).toContainText('PRISM');
  40 |     await expect(page.getByText(/Demo Teen|Simulator|Overview|Insight/i).first()).toBeVisible({ timeout: 15000 });
  41 | 
  42 |     // Verify local storage has token
  43 |     const token = await page.evaluate(() => localStorage.getItem('prism_token'));
  44 |     expect(token).not.toBeNull();
  45 |     expect(token?.length).toBeGreaterThan(10);
  46 |   });
  47 | });
  48 | 
```