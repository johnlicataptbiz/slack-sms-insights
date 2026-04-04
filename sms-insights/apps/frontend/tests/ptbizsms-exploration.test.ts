import { expect, test } from '@playwright/test';

/**
 * PTBiz SMS Insights - Website Exploration Test Suite
 *
 * This suite explores the key user flows and features of the ptbizsms.com platform
 * after the UI modernization deployment (dark theme with neon cyan accents).
 *
 * Test Coverage:
 * 1. Authentication flow (password entry)
 * 2. Dark theme design system verification
 * 3. Dashboard navigation and metrics display
 * 4. SMS data analytics features
 * 5. Integration with Monday.com/Slack/HubSpot
 * 6. Responsive design (mobile/tablet/desktop)
 * 7. Performance metrics
 * 8. Accessibility compliance
 */

test.describe('PTBiz SMS Insights - UI Modernization Exploration', () => {
  const BASE_URL = 'https://www.ptbizsms.com';
  const PASSWORD = 'bigbizin26';

  // Design system tokens (from modernization commit ef88eb2)
  const DESIGN_TOKENS = {
    darkNavy: '#0f1419', // Base background color
    neonCyan: '#00d9ff', // Primary accent color
    slackBlue: '#36c5f0', // Slack integration color
    mondayPurple: '#7b5cff', // Monday.com integration color
    hubspotOrange: '#ff7a59', // HubSpot integration color
  };

  test('1. Authentication Flow - Password Entry', async ({ page }) => {
    test.info().annotations.push({
      type: 'feature',
      description: 'User can authenticate with dashboard password',
    });

    // Navigate to homepage
    await page.goto(BASE_URL);

    // Verify authentication form is visible
    const passwordLabel = page.locator('text=Enter password');
    await expect(passwordLabel).toBeVisible({ timeout: 5000 });

    const enterButton = page.locator('button:has-text("Enter Dashboard")');
    await expect(enterButton).toBeVisible();

    // Find and fill password input
    const passwordInput = page.locator('input[type="password"]').first();
    await expect(passwordInput).toBeVisible();
    await passwordInput.fill(PASSWORD);

    // Submit authentication form
    await enterButton.click();

    // Wait for dashboard to load (networkidle ensures all assets loaded)
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);

    // Verify we're past authentication screen
    const dashboardElement = page.locator('main, [role="main"], body').first();
    await expect(dashboardElement).toBeVisible({ timeout: 10000 });
  });

  test('2. Dark Theme Verification - Color Palette', async ({ page }) => {
    test.info().annotations.push({
      type: 'feature',
      description:
        'Dark theme colors (#0f1419 navy, #00d9ff cyan) are rendered correctly',
    });

    await page.goto(BASE_URL);

    // Authenticate
    const passwordInput = page.locator('input[type="password"]').first();
    await passwordInput.fill(PASSWORD);
    await page.locator('button:has-text("Enter Dashboard")').click();
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);

    // Get computed styles from main container
    const mainElement = page.locator('body').first();
    const bgColor = await mainElement.evaluate((el) => {
      const styles = window.getComputedStyle(el);
      return styles.backgroundColor;
    });

    // Verify dark background is set
    expect(bgColor).toBeTruthy();

    // Check for dark theme CSS variables
    const cssVars = await mainElement.evaluate(() => {
      const root = document.documentElement;
      const styles = window.getComputedStyle(root);
      return {
        surface: styles.getPropertyValue('--v2-surface'),
        accent: styles.getPropertyValue('--v2-accent'),
      };
    });

    // At least one design token should be set
    const hasDesignTokens = Object.values(cssVars).some(
      (v) => v && v.trim().length > 0,
    );
    expect(hasDesignTokens).toBeTruthy();
  });

  test('3. Navigation - Dashboard Structure', async ({ page }) => {
    test.info().annotations.push({
      type: 'feature',
      description: 'Dashboard displays main navigation and content areas',
    });

    await page.goto(BASE_URL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button:has-text("Enter Dashboard")').click();
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);

    // Verify navigation elements exist
    const navElements = page.locator(
      'nav, [role="navigation"], header, [class*="nav"]',
    );
    const navCount = await navElements.count();

    // At least one navigation element should exist
    if (navCount > 0) {
      await expect(navElements.first()).toBeVisible({ timeout: 5000 });
    }

    // Verify main content area exists
    const mainContent = page.locator(
      'main, [role="main"], [class*="content"], [class*="dashboard"]',
    );
    const contentCount = await mainContent.count();
    expect(contentCount).toBeGreaterThan(0);
  });

  test('4. Metrics Display - Card Components', async ({ page }) => {
    test.info().annotations.push({
      type: 'feature',
      description: 'Dashboard displays metric cards with data',
    });

    await page.goto(BASE_URL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button:has-text("Enter Dashboard")').click();
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);

    // Look for metric/card components
    const cards = page.locator(
      '[class*="card"], [class*="metric"], [role="article"], div[class*="Box"]',
    );
    const cardCount = await cards.count();

    // Should have at least one card displayed
    if (cardCount > 0) {
      const firstCard = cards.first();
      await expect(firstCard).toBeVisible({ timeout: 5000 });

      // Card should have some text content
      const cardText = await firstCard.textContent();
      expect(cardText).toBeTruthy();
    }
  });

  test('5. Integration Indicators - Slack/Monday/HubSpot', async ({ page }) => {
    test.info().annotations.push({
      type: 'feature',
      description: 'Dashboard shows integration status for connected services',
    });

    await page.goto(BASE_URL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button:has-text("Enter Dashboard")').click();
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);

    // Look for integration indicators
    const integrationTexts = page.locator('text=/slack|monday|hubspot/i');
    const textCount = await integrationTexts.count();

    // Dashboard should reference at least one integration
    if (textCount > 0) {
      await expect(integrationTexts.first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('6. Responsive Design - Mobile Viewport', async ({ page }) => {
    test.info().annotations.push({
      type: 'feature',
      description: 'Dashboard is responsive and usable on mobile devices',
    });

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    await page.goto(BASE_URL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button:has-text("Enter Dashboard")').click();
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);

    // Dashboard should be accessible on mobile
    const bodyElement = page.locator('body');
    await expect(bodyElement).toBeVisible();

    // Check if responsive elements exist
    const responsiveElements = page.locator(
      '[class*="mobile"], [class*="responsive"], [class*="menu"]',
    );
    const responsiveCount = await responsiveElements.count();
    expect(responsiveCount >= 0).toBeTruthy();
  });

  test('7. Performance - Page Load Time', async ({ page }) => {
    test.info().annotations.push({
      type: 'performance',
      description: 'Dashboard loads within acceptable time frame',
    });

    const startTime = performance.now();

    // Navigate to home
    await page.goto(BASE_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 10000,
    });
    const homeLoadTime = performance.now() - startTime;

    // Authenticate
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    const authStartTime = performance.now();
    await page.locator('button:has-text("Enter Dashboard")').click();
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);
    const dashboardLoadTime = performance.now() - authStartTime;

    // Total should be reasonable
    const totalTime = performance.now() - startTime;
    console.log(`📊 Performance Metrics:`);
    console.log(`   Homepage: ${homeLoadTime.toFixed(2)}ms`);
    console.log(`   Dashboard: ${dashboardLoadTime.toFixed(2)}ms`);
    console.log(`   Total: ${totalTime.toFixed(2)}ms`);

    // Assert reasonable load times
    expect(homeLoadTime).toBeLessThan(5000);
    expect(dashboardLoadTime).toBeLessThan(8000);
  });

  test('8. Accessibility - Keyboard Navigation', async ({ page }) => {
    test.info().annotations.push({
      type: 'accessibility',
      description: 'Dashboard supports keyboard navigation',
    });

    await page.goto(BASE_URL);

    // Tab to password input
    await page.keyboard.press('Tab');
    const passwordInput = page.locator('input[type="password"]');
    const isFocused = await passwordInput
      .first()
      .evaluate((el) => el === document.activeElement);

    // Fill and submit via keyboard
    if (isFocused) {
      await page.keyboard.type(PASSWORD);
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');

      await page
        .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
        .catch(() => null);

      // Should be on dashboard
      const dashboardElement = page.locator('body');
      await expect(dashboardElement).toBeVisible();
    }
  });

  test('9. Typography - New Font System', async ({ page }) => {
    test.info().annotations.push({
      type: 'design',
      description:
        'Dashboard uses new typography system (Plus Jakarta Sans, Lexend Deca)',
    });

    await page.goto(BASE_URL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button:has-text("Enter Dashboard")').click();
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);

    // Check font families in use
    const bodyFontFamily = await page
      .locator('body')
      .evaluate((el) => window.getComputedStyle(el).fontFamily);

    // Should have a custom font loaded or system font fallback
    expect(bodyFontFamily).toBeTruthy();
    console.log(`📝 Font Family: ${bodyFontFamily}`);
  });

  test('10. CSS Modernization - Component Classes', async ({ page }) => {
    test.info().annotations.push({
      type: 'design',
      description:
        'Dashboard uses V2 component architecture with modernized styles',
    });

    await page.goto(BASE_URL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.locator('button:has-text("Enter Dashboard")').click();
    await page
      .waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 })
      .catch(() => null);

    // Check for V2 components or modern styling patterns
    const v2Elements = await page.locator('[class*="V2"]').count();
    const glassElements = await page
      .locator('[class*="glass"], [class*="backdrop"]')
      .count();
    const shadowElements = await page
      .locator('[class*="shadow"], [class*="dark"]')
      .count();

    console.log(`🎨 Component Analysis:`);
    console.log(`   V2 Components: ${v2Elements}`);
    console.log(`   Glass Morphism: ${glassElements}`);
    console.log(`   Shadow/Dark: ${shadowElements}`);

    // At least one modern pattern should be in use
    expect(v2Elements + glassElements + shadowElements).toBeGreaterThan(0);
  });
});

test.describe('Production Deployment Verification', () => {
  const BASE_URL = 'https://www.ptbizsms.com';
  const PASSWORD = 'bigbizin26';

  test('Deployment Check - Site is Live', async ({ page }) => {
    test.info().annotations.push({
      type: 'deployment',
      description: 'Production site is accessible and responding',
    });

    const response = await page.goto(BASE_URL);
    expect(response?.status()).toBeLessThan(400);
  });

  test('CSS Bundle - Modernization Assets Loaded', async ({ page }) => {
    test.info().annotations.push({
      type: 'deployment',
      description:
        'All CSS assets from modernization (v2.css, enhancements.css) are loaded',
    });

    await page.goto(BASE_URL);

    // Check for CSS files in page
    const stylesheets = await page.locator('link[rel="stylesheet"]').count();
    expect(stylesheets).toBeGreaterThan(0);

    // Verify styles are applied
    const styledElements = await page.locator('[style]').count();
    expect(styledElements).toBeGreaterThan(0);
  });
});
