import express from 'express';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';

const router = express.Router();

const EBAY_BASE = process.env.EBAY_SANDBOX_MODE === 'true'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

let _tokenCache = null;

async function getEbayToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60000) return _tokenCache.token;

  const credentials = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const resp = await axios.post(
    `${EBAY_BASE}/identity/v1/oauth2/token`,
    'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope%2Fsell.inventory',
    {
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  _tokenCache = {
    token: resp.data.access_token,
    expiresAt: Date.now() + resp.data.expires_in * 1000,
  };
  return _tokenCache.token;
}

/**
 * POST /api/ebay/post
 * Create and publish an eBay listing
 * Body: { listingId }
 */
router.post('/post', async (req, res) => {
  const { listingId } = req.body;
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });

  const photos = db
    .prepare('SELECT * FROM listing_photos WHERE listing_id = ? ORDER BY display_order')
    .all(listingId);

  try {
    const token = await getEbayToken();
    const sku = uuidv4();

    // Build image URLs (must be publicly accessible)
    const baseUrl = process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3001}`;
    const imageUrls = photos.map(
      (p) => `${baseUrl}${p.enhanced_path || p.original_path}`
    );

    // Create inventory item
    await axios.put(
      `${EBAY_BASE}/sell/inventory/v1/inventory_item/${sku}`,
      {
        availability: { shipToLocationAvailability: { quantity: 1 } },
        condition: conditionMap(listing.condition),
        product: {
          title: listing.title,
          description: listing.description,
          imageUrls,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Content-Language': 'en-US',
        },
      }
    );

    // Create offer
    const offerResp = await axios.post(
      `${EBAY_BASE}/sell/inventory/v1/offer`,
      {
        sku,
        marketplaceId: process.env.EBAY_MARKETPLACE_ID || 'EBAY_US',
        format: 'FIXED_PRICE',
        availableQuantity: 1,
        categoryId: '99', // General category fallback
        listingDescription: listing.description,
        pricingSummary: {
          price: { value: String(listing.price), currency: 'USD' },
        },
        listingPolicies: {
          fulfillmentPolicyId: process.env.EBAY_FULFILLMENT_POLICY_ID || '',
          paymentPolicyId: process.env.EBAY_PAYMENT_POLICY_ID || '',
          returnPolicyId: process.env.EBAY_RETURN_POLICY_ID || '',
        },
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const offerId = offerResp.data.offerId;

    // Publish offer
    const publishResp = await axios.post(
      `${EBAY_BASE}/sell/inventory/v1/offer/${offerId}/publish`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const listingId_ebay = publishResp.data.listingId;
    const listingUrl = process.env.EBAY_SANDBOX_MODE === 'true'
      ? `https://www.sandbox.ebay.com/itm/${listingId_ebay}`
      : `https://www.ebay.com/itm/${listingId_ebay}`;

    db.prepare(
      `INSERT INTO platform_listings (listing_id, platform, external_id, status, url, posted_at)
       VALUES (?, 'ebay', ?, 'live', ?, CURRENT_TIMESTAMP)`
    ).run(listingId, listingId_ebay, listingUrl);

    res.json({ ok: true, listingId: listingId_ebay, url: listingUrl });
  } catch (err) {
    const errMsg = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('eBay post error:', errMsg);

    db.prepare(
      `INSERT INTO platform_listings (listing_id, platform, status, error)
       VALUES (?, 'ebay', 'error', ?)`
    ).run(listingId, errMsg);

    res.status(500).json({ error: errMsg });
  }
});

function conditionMap(condition) {
  const map = {
    new: 'NEW',
    like_new: 'LIKE_NEW',
    good: 'USED_EXCELLENT',
    fair: 'USED_GOOD',
    poor: 'USED_ACCEPTABLE',
  };
  return map[condition] || 'USED_GOOD';
}

export default router;
