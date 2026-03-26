import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { getListing, getPhotos, updateListing } from '../store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * POST /api/ai/analyze
 * Analyze listing photos and generate title, description, category, price.
 * Body: { listingId }
 */
router.post('/analyze', async (req, res) => {
  const { listingId } = req.body;
  if (!listingId) return res.status(400).json({ error: 'listingId required' });

  const photos = (await getPhotos(listingId)).slice(0, 4);
  if (!photos.length) return res.status(400).json({ error: 'No photos found for listing' });

  const imageBlocks = photos.map((photo) => {
    const filePath = path.join(
      __dirname, '..', '..',
      (photo.enhanced_path || photo.original_path).replace(/^\//, '')
    );
    const base64 = fs.readFileSync(filePath).toString('base64');
    return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } };
  });

  const prompt = `You are an expert marketplace listing writer. Analyze these photos of a household item for sale and return a JSON object with:
- title: concise, keyword-rich title (max 80 chars)
- description: detailed, honest description (150-300 words) noting visible condition, features, and any flaws
- category: most appropriate eBay/marketplace category (e.g., "Furniture > Sofas", "Electronics > Laptops")
- condition: one of "new", "like_new", "good", "fair", "poor" based on what you see
- suggestedPrice: realistic USD price for this item in used condition on the local marketplace (number only)
- keywords: array of 5-8 search keywords buyers would use

Return ONLY valid JSON, no markdown, no explanation.`;

  try {
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: [...imageBlocks, { type: 'text', text: prompt }] }],
    });

    const analysis = JSON.parse(message.content[0].text.trim());

    await updateListing(listingId, {
      title:       analysis.title,
      description: analysis.description,
      category:    analysis.category,
      condition:   analysis.condition,
      price:       analysis.suggestedPrice,
    });

    res.json(analysis);
  } catch (err) {
    console.error('AI analysis error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/ai/platform-descriptions
 * Generate platform-adapted descriptions for a listing.
 * Body: { listingId }
 */
router.post('/platform-descriptions', async (req, res) => {
  const { listingId } = req.body;
  try {
    const listing = await getListing(listingId);

    const prompt = `Given this item listing:
Title: ${listing.title}
Description: ${listing.description}
Price: $${listing.price}
Condition: ${listing.condition}
Category: ${listing.category}

Generate platform-specific descriptions adapted for tone and format. Return JSON:
{
  "ebay": "formal, keyword-rich, bullet points for specs/features (200-300 words)",
  "craigslist": "casual, local community tone, brief and direct (80-120 words)",
  "facebook": "friendly conversational tone like talking to a neighbor, include a call-to-action (80-120 words)"
}
Return ONLY valid JSON.`;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    res.json(JSON.parse(message.content[0].text.trim()));
  } catch (err) {
    console.error('Platform descriptions error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
