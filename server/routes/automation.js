import express from 'express';
import db from '../db.js';
import { postToCraigslist } from '../automation/craigslist.js';
import { postToFacebook } from '../automation/facebook.js';

const router = express.Router();

/**
 * POST /api/automation/post
 * Trigger Playwright automation to post a listing to Craigslist and/or Facebook
 * Body: { listingId, platforms: ['craigslist', 'facebook'] }
 */
router.post('/post', async (req, res) => {
  const { listingId, platforms } = req.body;
  if (!listingId || !platforms?.length) {
    return res.status(400).json({ error: 'listingId and platforms required' });
  }

  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });

  const photos = db
    .prepare('SELECT * FROM listing_photos WHERE listing_id = ? ORDER BY display_order')
    .all(listingId);

  const results = {};

  // Mark as pending immediately
  for (const platform of platforms) {
    db.prepare(
      `INSERT OR REPLACE INTO platform_listings (listing_id, platform, status)
       VALUES (?, ?, 'pending')`
    ).run(listingId, platform);
  }

  // Run automations (non-blocking response, process continues)
  res.json({ ok: true, message: 'Automation started', platforms });

  for (const platform of platforms) {
    try {
      let result;
      if (platform === 'craigslist') {
        result = await postToCraigslist(listing, photos);
      } else if (platform === 'facebook') {
        result = await postToFacebook(listing, photos);
      } else {
        continue;
      }

      db.prepare(
        `UPDATE platform_listings SET status = 'live', url = ?, posted_at = CURRENT_TIMESTAMP
         WHERE listing_id = ? AND platform = ?`
      ).run(result.url || null, listingId, platform);

      results[platform] = { ok: true, url: result.url };
    } catch (err) {
      console.error(`${platform} automation error:`, err.message);
      db.prepare(
        `UPDATE platform_listings SET status = 'error', error = ? WHERE listing_id = ? AND platform = ?`
      ).run(err.message, listingId, platform);
      results[platform] = { ok: false, error: err.message };
    }
  }
});

export default router;
