import { google } from 'googleapis';
import { getSetting } from '../store.js';

async function getAuthedClient() {
  const tokensRaw = await getSetting('google_tokens');
  if (!tokensRaw) throw new Error('Google not connected. Visit /auth/google to connect.');
  const tokens = typeof tokensRaw === 'string' ? JSON.parse(tokensRaw) : tokensRaw;
  const auth = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  auth.setCredentials(tokens);
  return auth;
}

/**
 * Poll Gmail for unread Craigslist reply emails.
 * Returns array of { from, subject, body, threadId, messageId }
 */
export async function fetchCraigslistEmails() {
  const auth = await getAuthedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const resp = await gmail.users.messages.list({
    userId: 'me',
    q: 'from:craigslist.org is:unread',
    maxResults: 20,
  });

  const messages = resp.data.messages || [];
  const results = [];

  for (const msg of messages) {
    const full = await gmail.users.messages.get({ userId: 'me', id: msg.id });
    const headers = full.data.payload?.headers || [];

    const from = headers.find((h) => h.name === 'From')?.value || '';
    const subject = headers.find((h) => h.name === 'Subject')?.value || '';
    const body = extractBody(full.data.payload);

    results.push({
      from,
      subject,
      body,
      threadId: full.data.threadId,
      messageId: msg.id,
    });

    // Mark as read
    await gmail.users.messages.modify({
      userId: 'me',
      id: msg.id,
      requestBody: { removeLabelIds: ['UNREAD'] },
    });
  }

  return results;
}

/**
 * Send an email reply to a Craigslist buyer.
 */
export async function sendEmailReply({ to, subject, body, threadId }) {
  const auth = await getAuthedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  const replySubject = subject.startsWith('Re:') ? subject : `Re: ${subject}`;
  const rawMessage = [
    `To: ${to}`,
    `Subject: ${replySubject}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');

  const encoded = Buffer.from(rawMessage).toString('base64url');

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw: encoded,
      threadId,
    },
  });
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }
  return '';
}
