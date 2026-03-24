'use strict';

// ─── Load environment variables ───────────────────────────────────────────────
require('dotenv').config();

const express   = require('express');
const config    = require('./config');
const logger    = require('./src/logger');
const auth      = require('./src/schwab/auth');
const orders    = require('./src/schwab/orders');
const scheduler = require('./src/scheduler');

// ─── Validate required environment variables ──────────────────────────────────
const REQUIRED_ENV = ['SCHWAB_CLIENT_ID', 'SCHWAB_CLIENT_SECRET', 'SCHWAB_REDIRECT_URI', 'ANTHROPIC_API_KEY'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length) {
  console.error(`\nMissing required environment variables: ${missing.join(', ')}`);
  console.error('Copy .env.example to .env and fill in your credentials.\n');
  process.exit(1);
}

const AUTH_ONLY   = process.argv.includes('--auth-only');
const PAPER_MODE  = process.env.PAPER_TRADING === 'true';

// ─── OAuth Express server ─────────────────────────────────────────────────────
const app = express();

// Redirect to Schwab authorization URL (for first-time setup)
app.get('/', (req, res) => {
  const authUrl = auth.getAuthorizationUrl();
  res.redirect(authUrl);
});

// Schwab redirects here after the user logs in and grants access
app.get('/callback', async (req, res) => {
  const { code, error: oauthError } = req.query;

  if (oauthError) {
    res.send(`<h2>Authorization failed: ${oauthError}</h2><p>Close this tab and try again.</p>`);
    return;
  }

  if (!code) {
    res.send('<h2>Missing authorization code</h2><p>Close this tab and try again.</p>');
    return;
  }

  try {
    await auth.exchangeCodeForTokens(String(code));
    logger.log('[auth] Tokens saved successfully');
    res.send(`
      <h2>Authorization successful!</h2>
      <p>Your Schwab account is connected. You can close this tab.</p>
      <p>The trading bot will start automatically.</p>
    `);

    // If in auth-only mode, exit after a short delay to let the response flush
    if (AUTH_ONLY) {
      setTimeout(() => {
        logger.log('[auth] Auth-only mode: exiting after successful authorization');
        process.exit(0);
      }, 1000);
    } else {
      // Start the bot now that we have tokens
      startBot();
    }
  } catch (err) {
    logger.error('[auth] Token exchange failed', err);
    res.send(`<h2>Error: ${err.message}</h2><p>Close this tab and try again.</p>`);
  }
});

// ─── Start the OAuth server ───────────────────────────────────────────────────
app.listen(config.OAUTH_PORT, '127.0.0.1', () => {
  if (AUTH_ONLY) {
    console.log('\n========================================');
    console.log('  SCHWAB ACCOUNT AUTHORIZATION');
    console.log('========================================');
    console.log(`\n  1. Open this URL in your browser:`);
    console.log(`     http://127.0.0.1:${config.OAUTH_PORT}`);
    console.log('\n  2. Log in to your Schwab account');
    console.log('  3. Grant access to the trading bot');
    console.log('  4. This window will close automatically\n');
  }
});

// ─── Main bot startup ─────────────────────────────────────────────────────────
async function startBot() {
  console.log('\n========================================');
  console.log('  AI DAY TRADING BOT');
  console.log('========================================');
  if (PAPER_MODE) {
    console.log('  *** PAPER TRADING MODE — no real orders ***');
  } else {
    console.log('  *** LIVE TRADING — REAL MONEY AT RISK ***');
    console.log('  This bot trades real money. Ensure you');
    console.log('  understand the risks before continuing.');
  }
  console.log('========================================\n');

  // Verify Schwab API connectivity
  try {
    const { accountValue, positions } = await orders.getAccountInfo();
    logger.log(`[main] Connected to Schwab. Account value: $${accountValue.toFixed(2)}`);
    logger.log(`[main] Open positions in Schwab: ${positions.length}`);
  } catch (err) {
    logger.error('[main] Failed to connect to Schwab API', err);
    if (err.message.includes('No tokens')) {
      console.error('\nRun: node index.js --auth-only\nThen visit http://127.0.0.1:3001 to authorize.\n');
    }
    process.exit(1);
  }

  logger.log(`[main] Watchlist: ${config.WATCHLIST.join(', ')}`);
  logger.log(`[main] Position size: ${(config.POSITION_SIZE_PCT * 100).toFixed(0)}% | SL: ${(config.STOP_LOSS_PCT * 100).toFixed(1)}% | TP: ${(config.TAKE_PROFIT_PCT * 100).toFixed(1)}%`);
  logger.log(`[main] Max daily loss: ${(config.MAX_DAILY_LOSS_PCT * 100).toFixed(0)}%`);

  scheduler.start();
}

// ─── Entry point logic ────────────────────────────────────────────────────────
if (!AUTH_ONLY) {
  // Check if we already have tokens; if so, start immediately
  auth.getAccessToken()
    .then(() => {
      logger.log('[main] Existing tokens found — starting bot...');
      startBot();
    })
    .catch(() => {
      logger.log('[main] No valid tokens found. Visit http://127.0.0.1:' + config.OAUTH_PORT + ' to authorize.');
      logger.log('[main] Or run: node index.js --auth-only');
    });
}

// ─── Global error handlers (prevent crashes) ──────────────────────────────────
process.on('unhandledRejection', (reason) => {
  logger.error('[main] Unhandled promise rejection', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('[main] Uncaught exception', err);
});
