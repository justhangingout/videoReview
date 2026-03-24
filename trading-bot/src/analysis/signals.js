'use strict';

const config = require('../../config');

/**
 * Determine if a MACD bullish crossover just occurred:
 * histogram was negative (or zero) and is now positive.
 */
function isMacdBullishCrossover(macd, macdPrev) {
  if (!macd || !macdPrev) return false;
  return macdPrev.histogram <= 0 && macd.histogram > 0;
}

/**
 * Determine if a MACD bearish crossover just occurred:
 * histogram was positive (or zero) and is now negative.
 */
function isMacdBearishCrossover(macd, macdPrev) {
  if (!macd || !macdPrev) return false;
  return macdPrev.histogram >= 0 && macd.histogram < 0;
}

/**
 * Evaluate technical indicators and return a trade signal or null.
 *
 * Returns:
 *   { type: 'BUY' | 'SELL', strength: 1-3, reasons: string[] }
 *   or null if no signal.
 *
 * Strength scoring (each condition +1):
 *   BUY:  (1) RSI oversold, (2) MACD bullish crossover, (3) price ≤ BB lower band
 *   SELL: (1) RSI overbought, (2) MACD bearish crossover, (3) price ≥ BB upper band
 *
 * Both BUY and SELL also require EMA trend confirmation (price vs EMA21).
 */
function evaluateSignal(indicators) {
  const { rsi, macd, macdPrev, ema9, ema21, bb, currentPrice } = indicators;

  // ── BUY signal ────────────────────────────────────────────────────────────
  const rsiBuy     = rsi < config.RSI_OVERSOLD;
  const macdBuy    = isMacdBullishCrossover(macd, macdPrev);
  const emaBuy     = currentPrice > ema21;   // price in uptrend
  const bbBuy      = bb && currentPrice <= bb.lower; // near/below lower band

  if (rsiBuy && macdBuy && emaBuy) {
    let strength = 2; // RSI + MACD crossover are the core conditions
    const reasons = [
      `RSI ${rsi.toFixed(1)} < ${config.RSI_OVERSOLD} (oversold)`,
      `MACD bullish crossover (histogram: ${macdPrev.histogram.toFixed(4)} → ${macd.histogram.toFixed(4)})`,
      `Price $${currentPrice} > EMA21 $${ema21.toFixed(2)} (uptrend)`,
    ];

    if (bbBuy) {
      strength++;
      reasons.push(`Price at/below BB lower band $${bb.lower.toFixed(2)}`);
    }

    return { type: 'BUY', strength, reasons };
  }

  // ── SELL signal ───────────────────────────────────────────────────────────
  const rsiSell  = rsi > config.RSI_OVERBOUGHT;
  const macdSell = isMacdBearishCrossover(macd, macdPrev);
  const emaSell  = currentPrice < ema21;   // price in downtrend
  const bbSell   = bb && currentPrice >= bb.upper; // near/above upper band

  if (rsiSell && macdSell && emaSell) {
    let strength = 2;
    const reasons = [
      `RSI ${rsi.toFixed(1)} > ${config.RSI_OVERBOUGHT} (overbought)`,
      `MACD bearish crossover (histogram: ${macdPrev.histogram.toFixed(4)} → ${macd.histogram.toFixed(4)})`,
      `Price $${currentPrice} < EMA21 $${ema21.toFixed(2)} (downtrend)`,
    ];

    if (bbSell) {
      strength++;
      reasons.push(`Price at/above BB upper band $${bb.upper.toFixed(2)}`);
    }

    return { type: 'SELL', strength, reasons };
  }

  return null;
}

module.exports = { evaluateSignal };
