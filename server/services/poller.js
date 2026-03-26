import { fetchCraigslistEmails } from './gmail.js';
import { fetchEbayMessages } from './ebayMessages.js';
import { fetchFacebookMessages } from './facebookMessages.js';
import { handleInboundMessage } from './messageHandler.js';
import {
  getActiveListings, getUnnotifiedMeetings, updateMeeting,
  getThreadByPlatformId, getMessages,
} from '../store.js';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function pollMessages() {
  console.log(`[Poller] Checking messages at ${new Date().toLocaleTimeString()}`);

  // Craigslist via Gmail
  try {
    const emails = await fetchCraigslistEmails();
    for (const email of emails) {
      const listing = await findListingBySubject(email.subject);
      await handleInboundMessage({
        platform:      'craigslist',
        threadId:      email.threadId,
        buyerName:     email.from,
        buyerContact:  email.from,
        body:          email.body,
        itemId:        listing?.id?.toString(),
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
      if (await messageAlreadyProcessed('ebay', msg.threadId, msg.body)) continue;
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
      if (await messageAlreadyProcessed('facebook', msg.threadId, msg.body)) continue;
      await handleInboundMessage(msg);
    }
  } catch (err) {
    if (!err.message.includes('session not found')) {
      console.error('[Poller] Facebook error:', err.message);
    }
  }
}

async function messageAlreadyProcessed(platform, platformThreadId, body) {
  const thread = await getThreadByPlatformId(platform, platformThreadId);
  if (!thread) return false;
  const msgs = await getMessages(thread.id);
  return msgs.some((m) => m.direction === 'inbound' && m.body === body);
}

async function findListingBySubject(subject) {
  try {
    const listings = await getActiveListings();
    for (const l of listings) {
      if (l.title && subject.toLowerCase().includes(l.title.toLowerCase().slice(0, 20))) {
        return l;
      }
    }
  } catch { /* non-critical */ }
  return null;
}

async function checkMeetingNotifications() {
  try {
    const meetings = await getUnnotifiedMeetings();
    for (const meeting of meetings) {
      const meetDate = new Date(meeting.confirmed_time).toLocaleString();
      console.log(`\n🔔 MEETING ALERT: Sell "${meeting.title}" to ${meeting.buyer_name} (${meeting.platform}) at ${meetDate}\n`);

      await updateMeeting(meeting.id, { notified_user: true });

      if (process.env.USER_NOTIFY_EMAIL) {
        try {
          const { sendEmailReply } = await import('./gmail.js');
          await sendEmailReply({
            to:       process.env.USER_NOTIFY_EMAIL,
            subject:  `Meetup scheduled: ${meeting.title}`,
            body:     `Meetup scheduled!\n\nItem: ${meeting.title}\nBuyer: ${meeting.buyer_name} (${meeting.platform})\nTime: ${meetDate}`,
            threadId: null,
          });
        } catch { /* non-critical */ }
      }
    }
  } catch (err) {
    console.error('[Poller] Meeting notification error:', err.message);
  }
}

// Start after a short delay to let server fully initialize
setTimeout(() => {
  pollMessages();
  checkMeetingNotifications();
  setInterval(pollMessages, POLL_INTERVAL_MS);
  setInterval(checkMeetingNotifications, 60 * 1000);
}, 5000);

export { pollMessages };
