'use strict';

const fs   = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../config');

const TOKEN_FILE = path.resolve(config.TOKEN_FILE);

// ─── Disk helpers ─────────────────────────────────────────────────────────────

function loadTokens() {
  try {
    return JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function saveTokens(tokens) {
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(tokens, null, 2));
}

// ─── Basic-auth header ────────────────────────────────────────────────────────

function basicAuthHeader() {
  const creds = `${process.env.SCHWAB_CLIENT_ID}:${process.env.SCHWAB_CLIENT_SECRET}`;
  return `Basic ${Buffer.from(creds).toString('base64')}`;
}

// ─── Token refresh ────────────────────────────────────────────────────────────

async function refreshTokens(refreshToken) {
  const params = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
  });

  const { data } = await axios.post(config.SCHWAB_TOKEN_URL, params.toString(), {
    headers: {
      Authorization:  basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const tokens = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token || refreshToken, // Schwab may reuse old refresh token
    expires_at:    Date.now() + data.expires_in * 1000,
    token_type:    data.token_type,
  };
  saveTokens(tokens);
  return tokens;
}

// ─── Exchange authorization code ──────────────────────────────────────────────

async function exchangeCodeForTokens(code) {
  const params = new URLSearchParams({
    grant_type:   'authorization_code',
    code,
    redirect_uri: process.env.SCHWAB_REDIRECT_URI,
  });

  const { data } = await axios.post(config.SCHWAB_TOKEN_URL, params.toString(), {
    headers: {
      Authorization:  basicAuthHeader(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
  });

  const tokens = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token,
    expires_at:    Date.now() + data.expires_in * 1000,
    token_type:    data.token_type,
  };
  saveTokens(tokens);
  return tokens;
}

// ─── Public: get a valid access token ─────────────────────────────────────────

async function getAccessToken() {
  let tokens = loadTokens();

  if (!tokens) {
    throw new Error(
      'No tokens found. Run: node index.js --auth-only\n' +
      'Then visit http://127.0.0.1:3001 to authorize your Schwab account.'
    );
  }

  // Warn if refresh token expires within 24 hours (refresh tokens last 7 days)
  const refreshExpiresIn = tokens.expires_at - Date.now(); // approximate; Schwab doesn't return RT expiry
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const ONE_DAY_MS    = 24 * 60 * 60 * 1000;
  // Track when we first saved the token to estimate refresh token age
  if (tokens.saved_at && (Date.now() - tokens.saved_at) > (SEVEN_DAYS_MS - ONE_DAY_MS)) {
    console.warn('[auth] WARNING: Refresh token may expire soon. Re-run --auth-only if API calls fail.');
  }

  // Refresh access token if it expires within 60 seconds
  if (Date.now() >= tokens.expires_at - 60_000) {
    tokens = await refreshTokens(tokens.refresh_token);
  }

  return tokens.access_token;
}

// ─── Build the Schwab authorization URL ───────────────────────────────────────

function getAuthorizationUrl() {
  const params = new URLSearchParams({
    client_id:     process.env.SCHWAB_CLIENT_ID,
    redirect_uri:  process.env.SCHWAB_REDIRECT_URI,
    response_type: 'code',
    scope:         'PlaceTrades AccountAccess MarketData',
  });
  return `${config.SCHWAB_AUTH_URL}?${params.toString()}`;
}

module.exports = { getAccessToken, exchangeCodeForTokens, getAuthorizationUrl };
