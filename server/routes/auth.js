import express from 'express';
import { google } from 'googleapis';
import { getSetting, setSetting } from '../store.js';

const router = express.Router();

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.modify',
];

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback'
  );
}

router.get('/google', (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.status(500).send('GOOGLE_CLIENT_ID not configured in .env');
  }
  const url = getOAuthClient().generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });
  res.redirect(url);
});

router.get('/google/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');
  try {
    const { tokens } = await getOAuthClient().getToken(code);
    await setSetting('google_tokens', tokens);
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

router.get('/google/status', async (req, res) => {
  try {
    const tokens = await getSetting('google_tokens');
    res.json({ connected: !!tokens });
  } catch {
    res.json({ connected: false });
  }
});

export default router;
