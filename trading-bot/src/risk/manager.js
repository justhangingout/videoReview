'use strict';

const config = require('../../config');
const logger = require('../logger');

// ─── In-memory state ──────────────────────────────────────────────────────────

// Map of symbol → position details
const openPositions = new Map();

// Daily P&L tracking (reset at market open each day)
let dailyPnl       = 0;
let dailyStartValue = 0;
let tradingHalted   = false;
let lastResetDate   = '';

// ─── Daily reset ──────────────────────────────────────────────────────────────

function resetDailyStats(accountValue) {
  const today = new Date().toISOString().slice(0, 10);
  if (lastResetDate !== today) {
    dailyPnl        = 0;
    dailyStartValue = accountValue;
    tradingHalted   = false;
    lastResetDate   = today;
    logger.log(`[risk] Daily stats reset. Account value: $${accountValue.toFixed(2)}`);
  }
}

// ─── Can we take a new trade? ─────────────────────────────────────────────────

function canTrade(symbol, accountValue) {
  resetDailyStats(accountValue);

  if (tradingHalted) {
    logger.log(`[risk] Trading HALTED — max daily loss reached`);
    return false;
  }

  if (openPositions.has(symbol)) {
    logger.debug(`[risk] Already have open position in ${symbol}`);
    return false;
  }

  if (openPositions.size >= config.MAX_CONCURRENT_POSITIONS) {
    logger.log(`[risk] Max concurrent positions (${config.MAX_CONCURRENT_POSITIONS}) reached`);
    return false;
  }

  const maxLoss = dailyStartValue * config.MAX_DAILY_LOSS_PCT;
  if (dailyPnl <= -maxLoss) {
    tradingHalted = true;
    logger.log(`[risk] HALTING — daily loss $${Math.abs(dailyPnl).toFixed(2)} exceeds limit $${maxLoss.toFixed(2)}`);
    return false;
  }

  return true;
}

// ─── Position sizing ──────────────────────────────────────────────────────────

/**
 * Calculate number of shares to buy given account value.
 * Returns at least 1 share if affordable.
 */
function calcPositionSize(price, accountValue) {
  const dollarAmount = accountValue * config.POSITION_SIZE_PCT;
  const shares = Math.floor(dollarAmount / price);
  return Math.max(shares, 1);
}

/**
 * Compute a limit price for BUY/SELL orders with a small slippage buffer.
 */
function calcLimitPrice(price, side) {
  const slippage = price * config.ORDER_SLIPPAGE_PCT;
  return side === 'BUY'
    ? Math.round((price + slippage) * 100) / 100
    : Math.round((price - slippage) * 100) / 100;
}

// ─── Position tracking ────────────────────────────────────────────────────────

/**
 * Record a newly opened position.
 */
function trackPosition(symbol, side, quantity, filledPrice, orderId) {
  if (side !== 'BUY') return; // Only track long positions for now

  const stopLoss   = Math.round(filledPrice * (1 - config.STOP_LOSS_PCT)   * 100) / 100;
  const takeProfit = Math.round(filledPrice * (1 + config.TAKE_PROFIT_PCT) * 100) / 100;

  openPositions.set(symbol, {
    symbol,
    quantity,
    entryPrice: filledPrice,
    stopLoss,
    takeProfit,
    orderId,
    openedAt: new Date().toISOString(),
  });

  logger.log(
    `[risk] Opened: ${quantity}x ${symbol} @ $${filledPrice} | SL: $${stopLoss} | TP: $${takeProfit}`
  );
}

/**
 * Remove a position from tracking and update daily P&L.
 */
function closePosition(symbol, exitPrice) {
  const pos = openPositions.get(symbol);
  if (!pos) return null;

  const pnl = (exitPrice - pos.entryPrice) * pos.quantity;
  dailyPnl += pnl;
  openPositions.delete(symbol);

  logger.log(
    `[risk] Closed: ${symbol} @ $${exitPrice} | PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} | Daily PnL: $${dailyPnl.toFixed(2)}`
  );

  return { ...pos, exitPrice, pnl };
}

// ─── Stop-loss / take-profit check ───────────────────────────────────────────

/**
 * Given a map of { symbol → currentPrice }, return list of positions
 * that have hit their stop-loss or take-profit thresholds.
 *
 * @param {Map<string, number>} currentPrices
 * @returns {{ symbol, reason, position }[]}
 */
function checkStopLossTakeProfit(currentPrices) {
  const exits = [];

  for (const [symbol, pos] of openPositions.entries()) {
    const price = currentPrices.get(symbol);
    if (price == null) continue;

    if (price <= pos.stopLoss) {
      exits.push({ symbol, reason: 'STOP_LOSS', position: pos, exitPrice: price });
    } else if (price >= pos.takeProfit) {
      exits.push({ symbol, reason: 'TAKE_PROFIT', position: pos, exitPrice: price });
    }
  }

  return exits;
}

// ─── Getters ──────────────────────────────────────────────────────────────────

function getOpenPositions() {
  return new Map(openPositions);
}

function getDailyPnl() {
  return dailyPnl;
}

function isTradingHalted() {
  return tradingHalted;
}

module.exports = {
  canTrade,
  calcPositionSize,
  calcLimitPrice,
  trackPosition,
  closePosition,
  checkStopLossTakeProfit,
  getOpenPositions,
  getDailyPnl,
  isTradingHalted,
  resetDailyStats,
};
