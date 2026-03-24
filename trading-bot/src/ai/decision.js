'use strict';

const Anthropic = require('@anthropic-ai/sdk');
const config    = require('../../config');
const logger    = require('../logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Ask Claude to validate a trade signal using recent price action context.
 *
 * @param {string} symbol - Stock ticker
 * @param {{ type: string, strength: number, reasons: string[] }} signal
 * @param {object} indicators - computeIndicators() result
 * @param {object[]} recentCandles - Last 20 candles (oldest→newest)
 * @returns {{ approved: boolean, reason: string }}
 */
async function validateWithClaude(symbol, signal, indicators, recentCandles) {
  const { rsi, macd, ema9, ema21, bb, currentPrice } = indicators;
  const last20 = recentCandles.slice(-20);

  // Build a compact price summary (avoid sending too many tokens)
  const priceSummary = last20.map((c, i) =>
    `[${i + 1}] O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)} V:${c.volume}`
  ).join('\n');

  const prompt = `You are a quantitative trading risk analyst reviewing a ${signal.type} signal for ${symbol}.

## Signal Details
- Type: ${signal.type}
- Strength: ${signal.strength}/3
- Triggered because:
${signal.reasons.map(r => `  • ${r}`).join('\n')}

## Current Indicators
- Price: $${currentPrice}
- RSI(14): ${rsi.toFixed(2)}
- MACD histogram: ${macd.histogram.toFixed(4)}
- EMA9: $${ema9.toFixed(2)} | EMA21: $${ema21.toFixed(2)}
- Bollinger Bands: Upper $${bb?.upper?.toFixed(2) ?? 'N/A'} | Lower $${bb?.lower?.toFixed(2) ?? 'N/A'}

## Last 20 Five-Minute Candles (oldest→newest)
${priceSummary}

## Task
Should this ${signal.type} trade be executed? Consider:
1. Is the signal coherent with the recent price action?
2. Are there any red flags (e.g., extreme volatility, volume anomalies, erratic price swings)?
3. Does this look like a genuine opportunity or a false signal?

Reply with ONLY this JSON (no extra text):
{"approved": true or false, "reason": "one concise sentence explaining your decision"}`;

  try {
    const response = await anthropic.messages.create({
      model:      config.CLAUDE_MODEL,
      max_tokens: config.CLAUDE_MAX_TOKENS,
      messages:   [{ role: 'user', content: prompt }],
    });

    const text = response.content.find(b => b.type === 'text')?.text?.trim() ?? '';

    // Extract JSON from response (Claude sometimes adds markdown fences)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in Claude response: ${text}`);

    const parsed = JSON.parse(jsonMatch[0]);
    const approved = Boolean(parsed.approved);
    const reason   = String(parsed.reason || '').slice(0, 200);

    logger.debug(`[ai] ${symbol} ${signal.type} → ${approved ? 'APPROVED' : 'REJECTED'}: ${reason}`);
    return { approved, reason };

  } catch (err) {
    logger.log(`[ai] Claude validation failed for ${symbol}: ${err.message} — defaulting to REJECTED`);
    return { approved: false, reason: `Validation error: ${err.message}` };
  }
}

module.exports = { validateWithClaude };
