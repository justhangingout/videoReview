import express from 'express';
import db from '../db.js';

const router = express.Router();

// GET all settings
router.get('/', (req, res) => {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  // Don't expose sensitive tokens
  delete settings.google_tokens;
  res.json(settings);
});

// PATCH update settings
router.patch('/', (req, res) => {
  const allowed = [
    'meetup_location',
    'available_windows',
    'craigslist_city',
    'notify_email',
  ];

  const upsert = db.prepare(
    'INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)'
  );

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const value = typeof req.body[key] === 'object'
        ? JSON.stringify(req.body[key])
        : String(req.body[key]);
      upsert.run(key, value);
    }
  }

  res.json({ ok: true });
});

export default router;
