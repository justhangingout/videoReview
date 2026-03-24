import { fetchCraigslistEmails } from './gmail.js';
import { fetchEbayMessages } from './ebayMessages.js';
import { fetchFacebookMessages } from './facebookMessages.js';
import { handleInboundMessage } from './messageHandler.js';
import db from '../db.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function pollMessages() {
  console.log(`[Poller] Checking messages at ${new Date().toLocaleTimeString()}`);

  // Craigslist (via Gmail)
  try {
    const emails = await fetchCraigslistEmails();
    for (const email of emails) {
      // Extract listing title from subject to find matching listing
      const listing = findListingBySubject(email.subject);
      await handleInboundMessage({
        platform: 'craigslist',
        threadId: email.threadId,
        buyerName: email.from,
        buyerContact: email.from,
        body: email.body,
        itemId: listing?.id?.toString(),
      });
    }
  } catch (err) {
    if (!err.message.includes('Google not connected')) {
      console.error('[Poller] Craigslist error:', err.message);
    }
  }

  // eBay
  try {
    const ebayMsgs = await fetchEbayMessages();
    for (const msg of ebayMsgs) {
      // Check if already processed
      const existing = db.prepare(
        "SELECT id FROM messages WHERE thread_id = (SELECT id FROM message_threads WHERE platform = 'ebay' AND thread_id = ?) AND body = ? AND direction = 'inbound'",
      ).get(msg.threadId, msg.body);
      if (existing) continue;

      await handleInboundMessage(msg);
    }
  } catch (err) {
    if (!err.message.includes('EBAY_CLIENT_ID')) {
      console.error('[Poller] eBay error:', err.message);
    }
  }

  // Facebook
  try {
    const fbMsgs = await fetchFacebookMessages();
    for (const msg of fbMsgs) {
      const existing = db.prepare(
        "SELECT id FROM messages WHERE thread_id = (SELECT id FROM message_threads WHERE platform = 'facebook' AND thread_id = ?) AND body = ? AND direction = 'inbound'",
      ).get(msg.threadId, msg.body);
      if (existing) continue;

      await handleInboundMessage(msg);
    }
  } catch (err) {
    if (!err.message.includes('session not found')) {
      console.error('[Poller] Facebook error:', err.message);
    }
  }
}

function findListingBySubject(subject) {
  // Try to find a listing whose title appears in the email subject
  const listings = db.prepare("SELECT * FROM listings WHERE status != 'draft'").all();
  for (const l of listings) {
    if (l.title && subject.toLowerCase().includes(l.title.toLowerCase().slice(0, 20))) {
      return l;
    }
  }
  return null;
}

// Notify user when unnotified meetings exist (console log + could extend to email)
async function checkMeetingNotifications() {
  const unnotified = db.prepare(
    "SELECT sm.*, mt.buyer_name, mt.platform, l.title FROM scheduled_meetings sm JOIN message_threads mt ON mt.id = sm.thread_id LEFT JOIN listings l ON l.id = mt.listing_id WHERE sm.notified_user = 0 AND sm.status = 'confirmed'"
  ).all();

  for (const meeting of unnotified) {
    const meetDate = new Date(meeting.confirmed_time).toLocaleString();
    console.log(`\n🔔 MEETING ALERT: Sell "${meeting.title}" to ${meeting.buyer_name} (${meeting.platform}) at ${meetDate}\n`);
    db.prepare('UPDATE scheduled_meetings SET notified_user = 1 WHERE id = ?').run(meeting.id);

    // Send email notification if configured
    if (process.env.USER_NOTIFY_EMAIL) {
      try {
        await (await import('./gmail.js')).sendEmailReply({
          to: process.env.USER_NOTIFY_EMAIL,
          subject: `Meetup scheduled: ${meeting.title}`,
          body: `You have a meetup scheduled!\n\nItem: ${meeting.title}\nBuyer: ${meeting.buyer_name} (${meeting.platform})\nTime: ${meetDate}`,
          threadId: null,
        });
      } catch {
        // Notification email failure is non-critical
      }
    }
  }
}

// Start polling after a short delay to allow server to fully initialize
setTimeout(() => {
  pollMessages();
  checkMeetingNotifications();
  setInterval(pollMessages, POLL_INTERVAL_MS);
  setInterval(checkMeetingNotifications, 60 * 1000); // Check every minute
}, 5000);

export { pollMessages };
