import { google } from 'googleapis';
import db from '../db.js';

function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback'
  );
}

function getTokensFromDB() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'google_tokens'").get();
  return row ? JSON.parse(row.value) : null;
}

function saveTokensToDB(tokens) {
  db.prepare(
    "INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('google_tokens', ?, CURRENT_TIMESTAMP)"
  ).run(JSON.stringify(tokens));
}

function getAuthedClient() {
  const tokens = getTokensFromDB();
  if (!tokens) throw new Error('Google not connected. Visit /auth/google to connect.');
  const auth = getOAuthClient();
  auth.setCredentials(tokens);
  auth.on('tokens', (newTokens) => {
    if (newTokens.refresh_token) saveTokensToDB({ ...tokens, ...newTokens });
  });
  return auth;
}

/**
 * Get available time slots based on user-defined windows minus existing calendar events.
 * Returns array of ISO datetime strings.
 */
export async function getAvailableSlots(daysAhead = 7) {
  const auth = getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const windowsSetting = db.prepare("SELECT value FROM settings WHERE key = 'available_windows'").get();
  const windows = windowsSetting ? JSON.parse(windowsSetting.value) : [
    { days: [1, 2, 3, 4, 5], after: '18:00', before: '22:00' },
    { days: [0, 6], after: '08:00', before: '20:00' },
  ];

  const now = new Date();
  const endDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  // Fetch busy times from Google Calendar
  const freeBusyResp = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISOString(),
      timeMax: endDate.toISOString(),
      items: [{ id: 'primary' }],
    },
  });

  const busyTimes = freeBusyResp.data.calendars?.primary?.busy || [];

  // Generate candidate slots (every 2 hours within available windows)
  const slots = [];
  const cursor = new Date(now);
  cursor.setMinutes(0, 0, 0);
  cursor.setHours(cursor.getHours() + 2); // Start at least 2h from now

  while (cursor < endDate) {
    const dayOfWeek = cursor.getDay(); // 0=Sun, 6=Sat
    const timeStr = `${String(cursor.getHours()).padStart(2, '0')}:${String(cursor.getMinutes()).padStart(2, '0')}`;

    for (const win of windows) {
      if (win.days.includes(dayOfWeek) && timeStr >= win.after && timeStr < (win.before || '23:59')) {
        // Check not busy
        const slotEnd = new Date(cursor.getTime() + 60 * 60 * 1000);
        const isBusy = busyTimes.some(
          (b) => new Date(b.start) < slotEnd && new Date(b.end) > cursor
        );
        if (!isBusy) slots.push(new Date(cursor));
      }
    }

    cursor.setHours(cursor.getHours() + 2);
  }

  // Return up to 3 slots
  return slots.slice(0, 3).map((d) => d.toISOString());
}

/**
 * Format available slots into a human-readable string for messaging.
 */
export function formatSlots(slots) {
  return slots.map((iso) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'long', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }).join(', or ');
}

/**
 * Create a Google Calendar event for a confirmed meeting.
 */
export async function createMeetingEvent({ summary, description, startTime, location }) {
  const auth = getAuthedClient();
  const calendar = google.calendar({ version: 'v3', auth });

  const end = new Date(new Date(startTime).getTime() + 60 * 60 * 1000);

  const event = await calendar.events.insert({
    calendarId: 'primary',
    requestBody: {
      summary,
      description,
      location,
      start: { dateTime: startTime },
      end: { dateTime: end.toISOString() },
    },
  });

  return event.data.id;
}

export { getOAuthClient, saveTokensToDB };
