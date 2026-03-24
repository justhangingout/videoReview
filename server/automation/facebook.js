import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', '..', 'fb-session.json');

/**
 * Post a listing to Facebook Marketplace via browser automation.
 * Saves/restores session cookies to minimise re-login.
 */
export async function postToFacebook(listing, photos) {
  const browser = await chromium.launch({ headless: false, slowMo: 80 });

  // Restore saved session if available
  const storageState = fs.existsSync(SESSION_FILE) ? SESSION_FILE : undefined;
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();

  try {
    // Check if we're already logged in
    await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle' });
    const loggedIn = await page.$('[aria-label="Your profile"]') !== null ||
                     await page.$('[data-testid="blue_bar_profile_link"]') !== null;

    if (!loggedIn) {
      await login(page);
      // Save session for future use
      await context.storageState({ path: SESSION_FILE });
    }

    // Navigate to Marketplace create listing
    await page.goto('https://www.facebook.com/marketplace/create/item', { waitUntil: 'networkidle' });

    // Handle 2FA / checkpoint
    if (page.url().includes('checkpoint') || page.url().includes('two_factor')) {
      console.log('\n⚠️  Facebook requires 2FA verification. Please complete it in the browser window.\n');
      // Wait up to 2 minutes for user to complete 2FA
      await page.waitForURL('**/marketplace/create/**', { timeout: 120000 });
    }

    // Wait for the form to load
    await page.waitForSelector('[aria-label="Title"]', { timeout: 20000 });

    // Fill title
    await page.fill('[aria-label="Title"]', listing.title.slice(0, 100));

    // Fill price
    await page.fill('[aria-label="Price"]', String(Math.round(listing.price)));

    // Select condition
    await selectCondition(page, listing.condition);

    // Fill description
    const descField = await page.$('[aria-label="Description"]');
    if (descField) await descField.fill(buildFBDescription(listing));

    // Select category
    await selectCategory(page, listing.category);

    // Upload photos
    const photoPaths = photos
      .slice(0, 10)
      .map((p) =>
        path.join(
          __dirname, '..', '..',
          (p.enhanced_path || p.original_path).replace(/^\//, '')
        )
      )
      .filter((p) => fs.existsSync(p));

    if (photoPaths.length > 0) {
      const fileInput = await page.$('input[type="file"][accept*="image"]');
      if (fileInput) {
        await fileInput.setInputFiles(photoPaths);
        await page.waitForTimeout(3000);
      }
    }

    // Click "Next" or "Publish"
    const nextBtn = await page.$('[aria-label="Next"]') || await page.$('button:has-text("Next")');
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(2000);
    }

    const publishBtn = await page.$('[aria-label="Publish"]') || await page.$('button:has-text("Publish")');
    if (publishBtn) {
      await publishBtn.click();
      await page.waitForTimeout(5000);
    }

    // Try to grab the listing URL
    const currentUrl = page.url();
    const url = currentUrl.includes('marketplace') ? currentUrl : 'https://www.facebook.com/marketplace/';

    // Save updated session
    await context.storageState({ path: SESSION_FILE });

    console.log(`Facebook Marketplace posted: ${url}`);
    return { url };
  } finally {
    await browser.close();
  }
}

async function login(page) {
  const email = process.env.FACEBOOK_EMAIL;
  const password = process.env.FACEBOOK_PASSWORD;

  if (!email || !password) {
    throw new Error('FACEBOOK_EMAIL and FACEBOOK_PASSWORD must be set in .env');
  }

  await page.goto('https://www.facebook.com/login', { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#pass', password);
  await page.click('[name="login"]');
  await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });
}

async function selectCondition(page, condition) {
  const conditionMap = {
    new: 'New',
    like_new: 'Used - Like New',
    good: 'Used - Good',
    fair: 'Used - Fair',
    poor: 'Used - Poor',
  };
  const label = conditionMap[condition] || 'Used - Good';

  try {
    const conditionDropdown = await page.$('[aria-label="Condition"]');
    if (conditionDropdown) {
      await conditionDropdown.click();
      await page.waitForTimeout(500);
      const option = await page.$(`[role="option"]:has-text("${label}")`);
      if (option) await option.click();
    }
  } catch {
    // Condition field not always present
  }
}

async function selectCategory(page, category) {
  try {
    const categoryField = await page.$('[aria-label="Category"]');
    if (categoryField) {
      await categoryField.click();
      await page.waitForTimeout(500);
      // Try to match the top-level category word
      const topCat = category?.split('>')[0]?.trim() || '';
      const option = await page.$(`[role="option"]:has-text("${topCat}")`);
      if (option) await option.click();
    }
  } catch {
    // Category may auto-detect or not be required
  }
}

function buildFBDescription(listing) {
  const parts = [listing.description || ''];
  if (listing.condition) parts.push(`Condition: ${listing.condition.replace('_', ' ')}`);
  parts.push('Local pickup only. Message me with questions!');
  return parts.join('\n\n');
}
