'use strict';

const fs   = require('fs');
const path = require('path');
const config = require('../config');

const TRADE_LOG = path.resolve(config.TRADE_LOG);
const DEBUG     = process.env.LOG_LEVEL === 'debug';

function timestamp() {
  return new Date().toISOString();
}

function log(message) {
  console.log(`[${timestamp()}] ${message}`);
}

function debug(message) {
  if (DEBUG) console.log(`[${timestamp()}] ${message}`);
}

function warn(message) {
  console.warn(`[${timestamp()}] WARN: ${message}`);
}

function error(message, err) {
  console.error(`[${timestamp()}] ERROR: ${message}`, err ? err.message || err : '');
}

/**
 * Append a trade record to trades.json (one JSON object per line).
 */
function logTrade(record) {
  const line = JSON.stringify({ ts: timestamp(), ...record }) + '\n';
  try {
    fs.appendFileSync(TRADE_LOG, line);
  } catch (e) {
    console.error(`[${timestamp()}] Failed to write trade log: ${e.message}`);
  }
}

module.exports = { log, debug, warn, error, logTrade };
