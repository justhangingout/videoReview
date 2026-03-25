'use strict';

module.exports = {
  // Stocks to scan each cycle
  WATCHLIST: ['AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'SPY'],

  // Twitter/X handles for each watchlist symbol (without @).
  // Set to null for symbols with no relevant company account (e.g. ETFs).
  TWITTER_HANDLES: {
    AAPL:  'Apple',
    TSLA:  'Tesla',
    NVDA:  'nvidia',
    MSFT:  'Microsoft',
    AMZN:  'amazon',
    META:  'Meta',
    GOOGL: 'Google',
    SPY:   null, // S&P 500 ETF — no company account
  },

  // Max tweets to fetch per symbol per cycle
  TWITTER_MAX_TWEETS: 5,

  // How long to cache fetched tweets before re-fetching (ms)
  TWITTER_CACHE_TTL_MS: 5 * 60 * 1000, // 5 minutes

  // Cron expression: every 5 minutes, weekdays only
  SCAN_INTERVAL_CRON: '*/5 * * * 1-5',

  // Market hours in Eastern Time
  MARKET_OPEN:  { hour: 9,  minute: 30 },
  MARKET_CLOSE: { hour: 15, minute: 55 }, // Stop 5 min before close

  // Risk management
  POSITION_SIZE_PCT:       0.06,  // 6% of account value per trade
  STOP_LOSS_PCT:           0.035, // 3.5% below entry price
  TAKE_PROFIT_PCT:         0.07,  // 7% above entry price
  MAX_DAILY_LOSS_PCT:      0.15,  // Halt trading if down 15% on the day
  MAX_CONCURRENT_POSITIONS: 5,    // Max open positions at once

  // Technical indicator thresholds
  RSI_OVERSOLD:   35,
  RSI_OVERBOUGHT: 65,
  RSI_PERIOD:     14,
  MACD_FAST:      12,
  MACD_SLOW:      26,
  MACD_SIGNAL:    9,
  EMA_SHORT:      9,
  EMA_LONG:       21,
  BB_PERIOD:      20,
  BB_STD_DEV:     2,

  // Minimum signal strength to forward to Claude for validation (1-3)
  MIN_SIGNAL_STRENGTH: 2,

  // Schwab price history params (10 days of 5-min candles)
  PRICE_HISTORY_PERIOD_TYPE:    'day',
  PRICE_HISTORY_PERIOD:         10,
  PRICE_HISTORY_FREQUENCY_TYPE: 'minute',
  PRICE_HISTORY_FREQUENCY:      5,

  // Limit order slippage buffer (0.1% above/below market)
  ORDER_SLIPPAGE_PCT: 0.001,

  // OAuth / server
  OAUTH_PORT:  3001,
  TOKEN_FILE:  './tokens.json',
  TRADE_LOG:   './trades.json',

  // Schwab API
  SCHWAB_AUTH_URL:  'https://api.schwabapi.com/v1/oauth/authorize',
  SCHWAB_TOKEN_URL: 'https://api.schwabapi.com/v1/oauth/token',
  SCHWAB_API_BASE:  'https://api.schwabapi.com',

  // Claude model
  CLAUDE_MODEL:      'claude-sonnet-4-6',
  CLAUDE_MAX_TOKENS: 400,
};
