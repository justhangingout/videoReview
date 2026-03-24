'use strict';

const axios  = require('axios');
const auth   = require('./auth');
const config = require('../../config');

const BASE = config.SCHWAB_API_BASE;

async function apiGet(url, params = {}) {
  const token = await auth.getAccessToken();
  const { data } = await axios.get(url, {
    params,
    headers: { Authorization: `Bearer ${token}` },
  });
  return data;
}

// ─── Current quote ─────────────────────────────────────────────────────────────

/**
 * Returns { symbol, price, bid, ask, volume, changePercent }
 */
async function getQuote(symbol) {
  const data = await apiGet(`${BASE}/marketdata/v1/${encodeURIComponent(symbol)}/quotes`);

  // Schwab wraps the quote in an object keyed by symbol
  const q = data[symbol]?.quote || data[symbol] || {};

  return {
    symbol,
    price:         q.lastPrice   ?? q.mark ?? 0,
    bid:           q.bidPrice    ?? 0,
    ask:           q.askPrice    ?? 0,
    volume:        q.totalVolume ?? 0,
    changePercent: q.netPercentChangeInDouble ?? 0,
  };
}

// ─── Price history (OHLCV candles) ────────────────────────────────────────────

/**
 * Returns array of candles: [{ open, high, low, close, volume, datetime }]
 * Sorted oldest → newest.
 */
async function getPriceHistory(symbol) {
  const data = await apiGet(`${BASE}/marketdata/v1/pricehistory`, {
    symbol,
    periodType:    config.PRICE_HISTORY_PERIOD_TYPE,
    period:        config.PRICE_HISTORY_PERIOD,
    frequencyType: config.PRICE_HISTORY_FREQUENCY_TYPE,
    frequency:     config.PRICE_HISTORY_FREQUENCY,
    needExtendedHoursData: false,
  });

  if (!data.candles || data.candles.length === 0) {
    throw new Error(`No price history returned for ${symbol}`);
  }

  return data.candles.map(c => ({
    open:     c.open,
    high:     c.high,
    low:      c.low,
    close:    c.close,
    volume:   c.volume,
    datetime: c.datetime,
  }));
}

module.exports = { getQuote, getPriceHistory };
