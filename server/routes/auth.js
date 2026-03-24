import express from 'express';
import { getOAuthClient, saveTokensToDB } from '../services/calendar.js';
import db from '../db.js';

const router = express.Router();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
];

// GET /auth/google — redirect to Google OAuth consent screen
router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).send('GOOGLE_CLIENT_ID not configured in .env');
  }
  const auth = getOAuthClient();
  const url = auth.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(url);
});

// GET /auth/google/callback — exchange code for tokens
router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    const auth = getOAuthClient();
    const { tokens } = await auth.getToken(code);
    saveTokensToDB(tokens);
    res.send(`
      <html><body style="font-family:sans-serif;padding:2rem;">
        <h2>✅ Google Calendar & Gmail connected!</h2>
        <p>You can close this window and return to the app.</p>
        <script>setTimeout(() => window.close(), 3000);</script>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send(`OAuth error: ${err.message}`);
  }
});

// GET /auth/google/status
router.get('/google/status', (req, res) => {
  const row = db.prepare("SELECT key FROM settings WHERE key = 'google_tokens'").get();
  res.json({ connected: !!row });
});

export default router;
