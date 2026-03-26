import { google } from 'googleapis';
import { getSetting, setSetting } from '../store.js';

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback'
  );
}

async function getAuthedClient() {
  const tokensRaw = await getSetting('google_tokens');
  if (!tokensRaw) throw new Error('Google not connected. Visit /auth/google to connect.');

  const tokens = typeof tokensRaw === 'string' ? JSON.parse(tokensRaw) : tokensRaw;
  const auth = getOAuthClient();
  auth.setCredentials(tokens);
  auth.on('tokens', async (newTokens) => {
    if (newTokens.refresh_token) {
      await setSetting('google_tokens', { ...tokens, ...newTokens });
    }
  });
  return auth;
}

/**
 * Get available time slots within user-defined windows, minus existing calendar events.
 * Returns array of ISO datetime strings (up to 3).
 */
export async function getAvailableSlots(daysAhead = 7) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const windowsRaw = await getSetting('available_windows');
  const windows = windowsRaw
    ? (typeof windowsRaw === 'string' ? JSON.parse(windowsRaw) : windowsRaw)
    : [
        { days: [1, 2, 3, 4, 5], after: '18:00', before: '22:00' },
        { days: [0, 6], after: '08:00', before: '20:00' },
      ];

  const now = new Date();
  const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const freeBusyResp = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      items: [{ id: 'primary' }],
    },
  });
  const busyTimes = freeBusyResp.data.calendars?.primary?.busy || [];

  // Walk forward in 2-hour steps within defined windows
  const slots = [];
  const cursor = new Date(now);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 2);

  while (cursor < endDate && slots.length < 3) {
    const dayOfWeek = cursor.getDay();
    const timeStr = `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`;

    for (const win of windows) {
      if (
        win.days.includes(dayOfWeek) &&
        timeStr >= win.after &&
        timeStr < (win.before || '23:59')
      ) {
        const slotEnd = new Date(cursor.getTime() + 60 * 60 * 1000);
        const isBusy = busyTimes.some(
          (b) => new Date(b.start) < slotEnd && new Date(b.end) > cursor
        );
        if (!isBusy) slots.push(new Date(cursor));
      }
    }
    cursor.setHours(cursor.getHours() + 2);
  }

  return slots.map((d) => d.toISOString());
}

export function formatSlots(slots) {
  return slots
    .map((iso) =>
      new Date(iso).toLocaleString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    )
    .join(', or ');
}

export async function createMeetingEvent({ summary, description, startTime, location }) {
  const auth = await getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const end = new Date(new Date(startTime).getTime() + 60 * 60 * 1000);
  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary,
      description,
      location,
      start: { dateTime: startTime },
      end:   { dateTime: end.toISOString() },
    },
  });
  return event.data.id;
}
