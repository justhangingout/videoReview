import express from 'express';
import { getListing, getPhotos, upsertPlatformListing } from '../store.js';
import { postToCraigslist } from '../automation/craigslist.js';
import { postToFacebook } from '../automation/facebook.js';

const router = express.Router();

router.post('/post', async (req, res) => {
  const { listingId, platforms } = req.body;
  if (!listingId || !platforms?.length) {
    return res.status(400).json({ error: 'listingId and platforms required' });
  }

  const listing = await getListing(listingId).catch(() => null);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });

  const photos = await getPhotos(listingId);

  // Mark all as pending immediately
  await Promise.all(
    platforms.map((p) => upsertPlatformListing(listingId, p, { status: 'pending' }))
  );

  // Respond immediately; automation continues in background
  res.json({ ok: true, message: 'Automation started', platforms });

  for (const platform of platforms) {
    try {
      let result;
      if (platform === 'craigslist') result = await postToCraigslist(listing, photos);
      else if (platform === 'facebook') result = await postToFacebook(listing, photos);
      else continue;

      await upsertPlatformListing(listingId, platform, {
        status: 'live',
        url: result.url || null,
        posted_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error(`${platform} automation error:`, err.message);
      await upsertPlatformListing(listingId, platform, { status: 'error', error: err.message });
    }
  }
});

export default router;
