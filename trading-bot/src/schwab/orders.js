'use strict';

const axios  = require('axios');
const auth   = require('./auth');
const config = require('../../config');
const logger = require('../logger');

const BASE = config.SCHWAB_API_BASE;
const PAPER = () => process.env.PAPER_TRADING === 'true';

// ─── Fetch account number ─────────────────────────────────────────────────────

let _accountNumber = null;

async function getAccountNumber() {
  if (_accountNumber) return _accountNumber;

  const token = await auth.getAccessToken();
  const { data } = await axios.get(`${BASE}/trader/v1/accounts/accountNumbers`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  // Returns array of { accountNumber, hashValue }; use hashValue for API calls
  if (!data || data.length === 0) throw new Error('No Schwab accounts found');
  _accountNumber = data[0].hashValue;
  return _accountNumber;
}

// ─── Submit an order ──────────────────────────────────────────────────────────

/**
 * side: 'BUY' | 'SELL'
 * quantity: number of shares (integer)
 * limitPrice: price cap/floor (we use LIMIT orders to avoid slippage)
 */
async function submitOrder(symbol, side, quantity, limitPrice) {
  const roundedPrice = Math.round(limitPrice * 100) / 100;

  if (PAPER()) {
    const mockId = `PAPER-${Date.now()}`;
    logger.log(`[orders] PAPER ${side} ${quantity} ${symbol} @ $${roundedPrice} → orderId=${mockId}`);
    return { orderId: mockId, status: 'FILLED', filledPrice: roundedPrice, paper: true };
  }

  const accountNumber = await getAccountNumber();
  const token = await auth.getAccessToken();

  const order = {
    orderType:   'LIMIT',
    session:     'NORMAL',
    duration:    'DAY',
    orderStrategyType: 'SINGLE',
    price:       roundedPrice,
    orderLegCollection: [
      {
        instruction:   side === 'BUY' ? 'BUY' : 'SELL',
        quantity,
        instrument: {
          symbol,
          assetType: 'EQUITY',
        },
      },
    ],
  };

  const response = await axios.post(
    `${BASE}/trader/v1/accounts/${accountNumber}/orders`,
    order,
    { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
  );

  // Schwab returns the order ID in the Location header on 201
  const locationHeader = response.headers?.location || '';
  const orderId = locationHeader.split('/').pop() || String(response.status);

  logger.log(`[orders] ${side} ${quantity} ${symbol} @ $${roundedPrice} → orderId=${orderId}`);
  return { orderId, status: 'SUBMITTED', filledPrice: roundedPrice, paper: false };
}

// ─── Cancel an order ──────────────────────────────────────────────────────────

async function cancelOrder(orderId) {
  if (PAPER()) {
    logger.log(`[orders] PAPER cancel orderId=${orderId}`);
    return;
  }

  const accountNumber = await getAccountNumber();
  const token = await auth.getAccessToken();

  await axios.delete(`${BASE}/trader/v1/accounts/${accountNumber}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  logger.log(`[orders] Cancelled orderId=${orderId}`);
}

// ─── Fetch open positions + account value ─────────────────────────────────────

async function getAccountInfo() {
  const accountNumber = await getAccountNumber();
  const token = await auth.getAccessToken();

  const { data } = await axios.get(
    `${BASE}/trader/v1/accounts/${accountNumber}?fields=positions`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  const account      = data.securitiesAccount || data;
  const accountValue = account.currentBalances?.liquidationValue
                    || account.currentBalances?.totalCash
                    || 0;

  const positions = (account.positions || []).map(p => ({
    symbol:        p.instrument?.symbol,
    quantity:      p.longQuantity || p.shortQuantity || 0,
    averagePrice:  p.averagePrice,
    marketValue:   p.marketValue,
  }));

  return { accountValue, positions };
}

module.exports = { submitOrder, cancelOrder, getAccountInfo, getAccountNumber };
