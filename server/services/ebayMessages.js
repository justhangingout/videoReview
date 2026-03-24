import axios from 'axios';
import db from '../db.js';

const EBAY_BASE = process.env.EBAY_SANDBOX_MODE === 'true'
  ? 'https://api.sandbox.ebay.com'
  : 'https://api.ebay.com';

let _tokenCache = null;

async function getToken() {
  if (_tokenCache && _tokenCache.expiresAt > Date.now() + 60000) return _tokenCache.token;

  const credentials = Buffer.from(
    `${process.env.EBAY_CLIENT_ID}:${process.env.EBAY_CLIENT_SECRET}`
  ).toString('base64');

  const resp = await axios.post(
    `${EBAY_BASE}/identity/v1/oauth2/token`,
    'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope%2Fsell.messaging',
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
 * Fetch unread eBay buyer messages.
 */
export async function fetchEbayMessages() {
  try {
    const token = await getToken();
    const resp = await axios.get(`${EBAY_BASE}/post-order/v2/inquiry`, {
      headers: { Authorization: `Bearer ${token}` },
      params: { limit: 20, filter: 'OPEN' },
    });

    return (resp.data.inquiries || []).map((inquiry) => ({
      platform: 'ebay',
      threadId: inquiry.inquiryId,
      buyerName: inquiry.buyer?.username || 'eBay Buyer',
      buyerContact: inquiry.buyer?.username,
      body: inquiry.messages?.at(-1)?.text || '',
      itemId: inquiry.itemId,
    }));
  } catch (err) {
    console.error('eBay message fetch error:', err.message);
    return [];
  }
}

/**
 * Send a reply to an eBay buyer message.
 */
export async function sendEbayReply({ threadId, body }) {
  try {
    const token = await getToken();
    await axios.post(
      `${EBAY_BASE}/post-order/v2/inquiry/${threadId}/message`,
      { message: body },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('eBay reply error:', err.message);
    throw err;
  }
}
