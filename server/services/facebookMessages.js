import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, '..', '..', 'fb-session.json');

/**
 * Poll Facebook Marketplace messages via Playwright.
 * Returns array of new messages.
 */
export async function fetchFacebookMessages() {
  if (!fs.existsSync(SESSION_FILE)) {
    console.warn('Facebook session not found. Run a Facebook posting first to authenticate.');
    return [];
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const page = await context.newPage();

  const messages = [];

  try {
    await page.goto('https://www.facebook.com/marketplace/inbox', { waitUntil: 'networkidle', timeout: 30000 });

    // Check if still logged in
    if (page.url().includes('login')) {
      console.warn('Facebook session expired. Re-authentication required.');
      return [];
    }

    // Get conversation threads
    const threads = await page.$$('[data-testid="messaging_thread_item"], [aria-label*="conversation"]');

    for (const thread of threads.slice(0, 10)) {
      try {
        await thread.click();
        await page.waitForTimeout(1500);

        const messages_els = await page.$$('[data-testid="message_item"], [class*="message"]');
        const lastMsg = messages_els.at(-1);

        if (lastMsg) {
          const text = await lastMsg.textContent();
          const isInbound = !(await lastMsg.$('[aria-label*="You"]'));

          if (isInbound && text?.trim()) {
            const threadUrl = page.url();
            const threadId = threadUrl.split('/').filter(Boolean).pop();

            const buyerEl = await page.$('[data-testid="conversation_header"] [role="link"]');
            const buyerName = buyerEl ? await buyerEl.textContent() : 'Facebook Buyer';

            messages.push({
              platform: 'facebook',
              threadId,
              buyerName: buyerName?.trim(),
              buyerContact: threadId,
              body: text.trim(),
              threadUrl,
            });
          }
        }
      } catch {
        // Skip individual thread errors
      }
    }

    await context.storageState({ path: SESSION_FILE });
  } catch (err) {
    console.error('Facebook message fetch error:', err.message);
  } finally {
    await browser.close();
  }

  return messages;
}

/**
 * Send a reply in a Facebook Marketplace conversation.
 */
export async function sendFacebookReply({ threadUrl, body }) {
  if (!fs.existsSync(SESSION_FILE)) throw new Error('Facebook not authenticated');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: SESSION_FILE });
  const page = await context.newPage();

  try {
    await page.goto(threadUrl, { waitUntil: 'networkidle' });
    const input = await page.$('[contenteditable="true"][aria-label*="message"], [aria-label="Message"]');
    if (!input) throw new Error('Message input not found');
    await input.fill(body);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(1000);
    await context.storageState({ path: SESSION_FILE });
  } finally {
    await browser.close();
  }
}
