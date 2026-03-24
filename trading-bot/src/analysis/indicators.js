'use strict';

const ti     = require('technicalindicators');
const config = require('../../config');

/**
 * Compute all technical indicators from an array of OHLCV candles.
 * Candles must be sorted oldest → newest.
 *
 * Returns:
 *   {
 *     rsi,           // current RSI value
 *     macd,          // { MACD, signal, histogram } for last candle
 *     macdPrev,      // { MACD, signal, histogram } for second-to-last candle
 *     ema9,          // current EMA-9 value
 *     ema21,         // current EMA-21 value
 *     bb,            // { upper, middle, lower } Bollinger Bands for last candle
 *     currentPrice,  // last close price
 *   }
 */
function computeIndicators(candles) {
  if (candles.length < config.MACD_SLOW + config.MACD_SIGNAL + 5) {
    throw new Error(`Not enough candles (${candles.length}) to compute indicators`);
  }

  const closes  = candles.map(c => c.close);
  const highs   = candles.map(c => c.high);
  const lows    = candles.map(c => c.low);

  // RSI
  const rsiValues = ti.RSI.calculate({ values: closes, period: config.RSI_PERIOD });
  const rsi = rsiValues[rsiValues.length - 1];

  // MACD
  const macdValues = ti.MACD.calculate({
    values:             closes,
    fastPeriod:         config.MACD_FAST,
    slowPeriod:         config.MACD_SLOW,
    signalPeriod:       config.MACD_SIGNAL,
    SimpleMAOscillator: false,
    SimpleMASignal:     false,
  });
  const macd     = macdValues[macdValues.length - 1];
  const macdPrev = macdValues[macdValues.length - 2];

  // EMA 9 and 21
  const ema9Values  = ti.EMA.calculate({ values: closes, period: config.EMA_SHORT });
  const ema21Values = ti.EMA.calculate({ values: closes, period: config.EMA_LONG });
  const ema9  = ema9Values[ema9Values.length - 1];
  const ema21 = ema21Values[ema21Values.length - 1];

  // Bollinger Bands
  const bbValues = ti.BollingerBands.calculate({
    values:  closes,
    period:  config.BB_PERIOD,
    stdDev:  config.BB_STD_DEV,
  });
  const bb = bbValues[bbValues.length - 1]; // { upper, middle, lower }

  return {
    rsi,
    macd,
    macdPrev,
    ema9,
    ema21,
    bb,
    currentPrice: closes[closes.length - 1],
  };
}

module.exports = { computeIndicators };
