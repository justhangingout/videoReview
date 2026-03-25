'use strict';

/**
 * src/social/twitter.js
 *
 * Fetches recent tweets for a company by scraping public Nitter RSS feeds.
 * Nitter is an open-source Twitter/X frontend that exposes RSS without auth.
 *
 * NOTE: This relies on public Nitter instances. If all instances are down,
 * tweet fetching is skipped gracefully — it never blocks trading.
 *
 * IMPORTANT: Scraping Twitter data via Nitter may conflict with Twitter/X
 * Terms of Service. Use at your own discretion.
 */

const axios  = require('axios');
const { XMLParser } = require('fast-xml-parser');
const config = require('../../config');
const logger = require('../logger');

// Public Nitter instances — tried in order, first success wins
const NITTER_INSTANCES = [
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
  'https://nitter.1d4.us',
  'https://nitter.net',
];

const xmlParser = new XMLParser({ ignoreAttributes: false });

// Simple in-memory tweet cache: handle → { tweets, fetchedAt }
const tweetCache = new Map();

/**
 * Fetch up to `maxTweets` recent tweets for a Twitter handle.
 * Returns an array of plain-text tweet strings, or [] on any error.
 *
 * @param {string} handle - Twitter username without @, e.g. "Apple"
 * @param {number} maxTweets
 * @returns {Promise<string[]>}
 */
async function fetchRecentTweets(handle, maxTweets = config.TWITTER_MAX_TWEETS) {
  if (!handle) return [];

  // Return cached tweets if fresh
  const cached = tweetCache.get(handle);
  if (cached && Date.now() - cached.fetchedAt < config.TWITTER_CACHE_TTL_MS) {
    logger.debug(`[twitter] Using cached tweets for @${handle}`);
    return cached.tweets;
  }

  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `${instance}/${handle}/rss`;
      const response = await axios.get(url, {
        timeout: 8000,
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; TradingBot/1.0)' },
      });

      const parsed   = xmlParser.parse(response.data);
      const items    = parsed?.rss?.channel?.item ?? [];
      const itemList = Array.isArray(items) ? items : [items];

      // Extract tweet text from <title> field (Nitter puts the tweet text there)
      const tweets = itemList
        .slice(0, maxTweets)
        .map(item => {
          // Strip RT prefix, HTML tags, and excess whitespace
          const raw = String(item.title ?? item.description ?? '');
          return raw
            .replace(/^R to @\S+:\s*/i, '')
            .replace(/<[^>]+>/g, '')
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/\s+/g, ' ')
            .trim();
        })
        .filter(t => t.length > 5);

      tweetCache.set(handle, { tweets, fetchedAt: Date.now() });
      logger.debug(`[twitter] Fetched ${tweets.length} tweets for @${handle} via ${instance}`);
      return tweets;

    } catch (err) {
      logger.debug(`[twitter] Instance ${instance} failed for @${handle}: ${err.message}`);
      // Try next instance
    }
  }

  logger.debug(`[twitter] All Nitter instances failed for @${handle} — skipping tweet context`);
  return [];
}

/**
 * Fetch tweets for multiple handles in parallel.
 * Returns a map of { handle → tweets[] }.
 *
 * @param {string[]} handles
 * @returns {Promise<Map<string, string[]>>}
 */
async function fetchTweetsForHandles(handles) {
  const results = await Promise.all(
    handles.map(h => fetchRecentTweets(h).then(tweets => [h, tweets]))
  );
  return new Map(results);
}

module.exports = { fetchRecentTweets, fetchTweetsForHandles };
