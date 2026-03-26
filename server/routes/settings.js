import express from 'express';
import { getAllSettings, setSetting } from '../store.js';

const router = express.Router();

const ALLOWED = ['meetup_location', 'available_windows', 'craigslist_city', 'notify_email'];

router.get('/', async (req, res) => {
  try {
    const settings = await getAllSettings();
    delete settings.google_tokens; // never expose stored OAuth tokens
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/', async (req, res) => {
  try {
    await Promise.all(
      ALLOWED
        .filter((key) => req.body[key] !== undefined)
        .map((key) => setSetting(key, req.body[key]))
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
