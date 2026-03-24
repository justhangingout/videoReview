import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Post a listing to Craigslist via browser automation.
 * @param {Object} listing - Listing record from DB
 * @param {Array}  photos  - Photo records from DB
 */
export async function postToCraigslist(listing, photos) {
  const city = process.env.CRAIGSLIST_CITY || 'sfbay';
  const email = process.env.CRAIGSLIST_EMAIL || process.env.GMAIL_USER;

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(`https://${city}.craigslist.org/post`);

    // Step 1: Select type = "for sale by owner"
    await page.waitForSelector('input[value="fso"]', { timeout: 15000 });
    await page.click('input[value="fso"]');
    await page.click('button.submit');

    // Step 2: Select category based on listing.category
    const categoryMap = guessCLCategory(listing.category);
    await page.waitForSelector('.cat-container', { timeout: 10000 });

    // Try to find matching category link
    const catLinks = await page.$$('.cat-container a');
    let matched = false;
    for (const link of catLinks) {
      const text = await link.textContent();
      if (text.toLowerCase().includes(categoryMap.toLowerCase())) {
        await link.click();
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Fall back to "general for sale"
      const fallback = await page.$('a:has-text("general for sale")');
      if (fallback) await fallback.click();
      else await catLinks[0].click();
    }

    // Step 3: Fill in the listing form
    await page.waitForSelector('#PostingTitle', { timeout: 10000 });
    await page.fill('#PostingTitle', listing.title.slice(0, 100));
    await page.fill('#price', String(Math.round(listing.price)));

    // Location/area (use default)
    const cityField = await page.$('#geographic_area');
    if (cityField) await cityField.fill(city);

    await page.fill('#PostingBody', buildCLDescription(listing));

    // Postal code if prompted
    const postal = await page.$('#postal_code');
    if (postal && process.env.POSTAL_CODE) await postal.fill(process.env.POSTAL_CODE);

    await page.click('button.submit');

    // Step 4: Upload photos
    await page.waitForSelector('input[type="file"]', { timeout: 10000 });
    const photoPaths = photos
      .slice(0, 8)
      .map((p) =>
        path.join(__dirname, '..', '..', p.enhanced_path?.replace(/^\//, '') || p.original_path.replace(/^\//, ''))
      );

    await page.setInputFiles('input[type="file"]', photoPaths);
    await page.waitForTimeout(3000); // Allow uploads to process

    await page.click('button.submit');

    // Step 5: Enter email
    await page.waitForSelector('#from_ename, #email_privacy_choice', { timeout: 10000 });
    const emailInput = await page.$('#from_ename');
    if (emailInput && email) await emailInput.fill(email);

    // Choose to show email or use CL relay
    const relaybtn = await page.$('input[value="C"]');
    if (relaybtn) await relaybtn.click();

    await page.click('button.submit');

    // Step 6: Review and publish
    await page.waitForSelector('button.submit, input[value="publish"]', { timeout: 10000 });
    await page.click('button.submit, input[value="publish"]');

    // Wait for confirmation page
    await page.waitForURL(/manage/, { timeout: 20000 }).catch(() => {});

    const url = page.url();
    console.log(`Craigslist posted: ${url}`);

    return { url };
  } finally {
    await browser.close();
  }
}

function guessCLCategory(category = '') {
  const cat = category.toLowerCase();
  if (cat.includes('furniture')) return 'furniture';
  if (cat.includes('electronic') || cat.includes('laptop') || cat.includes('computer')) return 'electronics';
  if (cat.includes('clothing') || cat.includes('apparel')) return 'clothing';
  if (cat.includes('appliance')) return 'appliances';
  if (cat.includes('book')) return 'books';
  if (cat.includes('toy') || cat.includes('game')) return 'toys & games';
  if (cat.includes('sport') || cat.includes('fitness')) return 'sporting goods';
  if (cat.includes('tool')) return 'tools';
  if (cat.includes('jewelry')) return 'jewelry';
  return 'general';
}

function buildCLDescription(listing) {
  const lines = [listing.description || ''];
  if (listing.condition) lines.push(`\nCondition: ${listing.condition.replace('_', ' ')}`);
  lines.push('\nCash or Venmo only. Local pickup.');
  return lines.join('\n');
}
