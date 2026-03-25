'use strict';

const cron       = require('node-cron');
const config     = require('../config');
const logger     = require('./logger');
const marketData = require('./schwab/marketData');
const orders     = require('./schwab/orders');
const indicators = require('./analysis/indicators');
const signals    = require('./analysis/signals');
const ai         = require('./ai/decision');
const risk       = require('./risk/manager');
const twitter    = require('./social/twitter');

// ─── Market hours check (Eastern Time) ───────────────────────────────────────

function isMarketOpen() {
  const now = new Date();
  // Convert to Eastern Time
  const etString = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et       = new Date(etString);
  const day      = et.getDay(); // 0=Sun, 6=Sat
  const hour     = et.getHours();
  const minute   = et.getMinutes();

  if (day === 0 || day === 6) return false; // Weekend

  const openMinutes  = config.MARKET_OPEN.hour  * 60 + config.MARKET_OPEN.minute;
  const closeMinutes = config.MARKET_CLOSE.hour * 60 + config.MARKET_CLOSE.minute;
  const nowMinutes   = hour * 60 + minute;

  return nowMinutes >= openMinutes && nowMinutes <= closeMinutes;
}

// ─── Scan a single symbol ─────────────────────────────────────────────────────

async function scanSymbol(symbol, accountValue) {
  try {
    // 1. Fetch market data
    const [quote, candles] = await Promise.all([
      marketData.getQuote(symbol),
      marketData.getPriceHistory(symbol),
    ]);

    if (!candles || candles.length < 40) {
      logger.debug(`[scheduler] Not enough candles for ${symbol} (${candles?.length ?? 0})`);
      return;
    }

    // 2. Compute indicators
    const ind = indicators.computeIndicators(candles);

    // 3. Evaluate signal
    const signal = signals.evaluateSignal(ind);
    if (!signal) {
      logger.debug(`[scheduler] No signal for ${symbol} (RSI: ${ind.rsi?.toFixed(1)})`);
      return;
    }

    logger.log(`[scheduler] ${symbol}: ${signal.type} signal (strength ${signal.strength}/3) — ${signal.reasons[0]}`);

    // 4. Filter by minimum strength
    if (signal.strength < config.MIN_SIGNAL_STRENGTH) {
      logger.debug(`[scheduler] ${symbol}: signal strength ${signal.strength} below minimum ${config.MIN_SIGNAL_STRENGTH}`);
      return;
    }

    // 5. Fetch tweets for additional context (non-blocking — empty array on failure)
    const twitterHandle = config.TWITTER_HANDLES[symbol] ?? null;
    const recentTweets  = twitterHandle
      ? await twitter.fetchRecentTweets(twitterHandle)
      : [];

    if (recentTweets.length > 0) {
      logger.log(`[scheduler] ${symbol}: fetched ${recentTweets.length} tweet(s) from @${twitterHandle}`);
    }

    // 6. AI validation (with tweet context)
    const decision = await ai.validateWithClaude(symbol, signal, ind, candles, recentTweets);
    if (!decision.approved) {
      logger.log(`[scheduler] ${symbol}: Claude REJECTED — ${decision.reason}`);
      return;
    }
    logger.log(`[scheduler] ${symbol}: Claude APPROVED — ${decision.reason}`);

    // 7. Risk check
    if (!risk.canTrade(symbol, accountValue)) {
      return; // reason logged inside canTrade()
    }

    // 8. Execute order
    const quantity   = risk.calcPositionSize(quote.price, accountValue);
    const limitPrice = risk.calcLimitPrice(quote.price, signal.type);

    const result = await orders.submitOrder(symbol, signal.type, quantity, limitPrice);

    // 9. Track position (for BUY orders)
    if (signal.type === 'BUY') {
      risk.trackPosition(symbol, signal.type, quantity, result.filledPrice, result.orderId);
    } else if (signal.type === 'SELL') {
      // Close existing long position if we have one
      const closed = risk.closePosition(symbol, result.filledPrice);
      if (!closed) logger.warn(`[scheduler] SELL executed for ${symbol} but no tracked position found`);
    }

    // 10. Log to trades.json
    logger.logTrade({
      symbol,
      side:        signal.type,
      quantity,
      price:       result.filledPrice,
      orderId:     result.orderId,
      paper:       result.paper,
      signalStrength: signal.strength,
      aiReason:    decision.reason,
      indicators: {
        rsi:  ind.rsi?.toFixed(2),
        macd: ind.macd?.histogram?.toFixed(4),
        ema21: ind.ema21?.toFixed(2),
      },
    });

  } catch (err) {
    logger.error(`[scheduler] Error scanning ${symbol}`, err);
  }
}

// ─── Check stop-loss / take-profit on open positions ─────────────────────────

async function checkOpenPositions() {
  const positions = risk.getOpenPositions();
  if (positions.size === 0) return;

  // Fetch current prices for all open positions
  const symbols = [...positions.keys()];
  const quotes  = await Promise.all(symbols.map(s => marketData.getQuote(s).catch(() => null)));

  const priceMap = new Map();
  symbols.forEach((s, i) => {
    if (quotes[i]) priceMap.set(s, quotes[i].price);
  });

  // Check thresholds
  const exits = risk.checkStopLossTakeProfit(priceMap);

  for (const { symbol, reason, position, exitPrice } of exits) {
    logger.log(`[scheduler] ${symbol}: ${reason} triggered @ $${exitPrice} (entry $${position.entryPrice})`);

    try {
      const limitPrice = risk.calcLimitPrice(exitPrice, 'SELL');
      const result     = await orders.submitOrder(symbol, 'SELL', position.quantity, limitPrice);
      const closed     = risk.closePosition(symbol, result.filledPrice);

      logger.logTrade({
        symbol,
        side:    'SELL',
        quantity: position.quantity,
        price:   result.filledPrice,
        orderId: result.orderId,
        paper:   result.paper,
        exitReason: reason,
        pnl:     closed?.pnl,
      });
    } catch (err) {
      logger.error(`[scheduler] Failed to close position for ${symbol}`, err);
    }
  }
}

// ─── Main scan cycle ──────────────────────────────────────────────────────────

async function runScanCycle() {
  if (!isMarketOpen()) {
    logger.debug('[scheduler] Market closed — skipping scan');
    return;
  }

  logger.log(`[scheduler] === Scan cycle starting (${config.WATCHLIST.length} symbols) ===`);

  try {
    // Get current account info
    const { accountValue } = await orders.getAccountInfo();
    logger.log(`[scheduler] Account value: $${accountValue.toFixed(2)} | Daily PnL: $${risk.getDailyPnl().toFixed(2)}`);

    if (risk.isTradingHalted()) {
      logger.log('[scheduler] Trading halted for today. Monitoring open positions only.');
      await checkOpenPositions();
      return;
    }

    // Scan each symbol sequentially (avoids rate-limit bursts)
    for (const symbol of config.WATCHLIST) {
      await scanSymbol(symbol, accountValue);
    }

    // Check stop-loss / take-profit on open positions
    await checkOpenPositions();

  } catch (err) {
    logger.error('[scheduler] Scan cycle failed', err);
  }

  logger.log(`[scheduler] === Scan cycle complete ===`);
}

// ─── Start the scheduler ──────────────────────────────────────────────────────

function start() {
  logger.log(`[scheduler] Starting cron: "${config.SCAN_INTERVAL_CRON}" | Watchlist: ${config.WATCHLIST.join(', ')}`);

  cron.schedule(config.SCAN_INTERVAL_CRON, () => {
    runScanCycle().catch(err => logger.error('[scheduler] Unhandled error in scan cycle', err));
  });

  // Run an immediate first scan if market is open
  runScanCycle().catch(err => logger.error('[scheduler] Initial scan failed', err));
}

module.exports = { start, isMarketOpen };
