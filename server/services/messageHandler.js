import Anthropic from '@anthropic-ai/sdk';
import db from '../db.js';
import { getAvailableSlots, formatSlots, createMeetingEvent } from './calendar.js';
import { sendEmailReply } from './gmail.js';
import { sendEbayReply } from './ebayMessages.js';
import { sendFacebookReply } from './facebookMessages.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

/**
 * Process a new inbound message and generate + send an AI reply.
 * If the message confirms a meeting, create calendar event and notify user.
 */
export async function handleInboundMessage({ platform, threadId, buyerName, buyerContact, body, itemId }) {
  // Find or create thread
  let thread = db.prepare(
    'SELECT * FROM message_threads WHERE platform = ? AND thread_id = ?'
  ).get(platform, threadId);

  if (!thread) {
    // Try to match to a listing by platform external_id
    const platformListing = itemId
      ? db.prepare('SELECT * FROM platform_listings WHERE platform = ? AND external_id = ?').get(platform, itemId)
      : null;

    const insertResult = db.prepare(
      `INSERT INTO message_threads (listing_id, platform, thread_id, buyer_name, buyer_contact)
       VALUES (?, ?, ?, ?, ?)`
    ).run(platformListing?.listing_id || null, platform, threadId, buyerName, buyerContact);

    thread = db.prepare('SELECT * FROM message_threads WHERE id = ?').get(insertResult.lastInsertRowid);
  }

  // Skip if thread is archived or meeting already scheduled
  if (thread.status === 'archived' || thread.status === 'meeting_scheduled') return;

  // Save inbound message
  db.prepare(
    'INSERT INTO messages (thread_id, direction, body, ai_generated) VALUES (?, "inbound", ?, 0)'
  ).run(thread.id, body);

  // Get listing details for context
  const listing = thread.listing_id
    ? db.prepare('SELECT * FROM listings WHERE id = ?').get(thread.listing_id)
    : null;

  // Get settings
  const settings = {};
  db.prepare('SELECT key, value FROM settings').all().forEach((r) => {
    settings[r.key] = r.value;
  });
  const meetupLocation = settings.meetup_location || 'a public location';

  // Get conversation history for context
  const history = db.prepare(
    'SELECT direction, body FROM messages WHERE thread_id = ? ORDER BY sent_at ASC'
  ).all(thread.id);

  const historyText = history
    .map((m) => `${m.direction === 'inbound' ? 'Buyer' : 'Seller'}: ${m.body}`)
    .join('\n');

  // Check if this is a meeting confirmation
  const lowerBody = body.toLowerCase();
  const isMeetingConfirmation =
    lowerBody.includes('works for me') ||
    lowerBody.includes("that works") ||
    lowerBody.includes('sounds good') ||
    lowerBody.includes("i'll be there") ||
    lowerBody.includes('see you') ||
    lowerBody.includes('confirmed') ||
    lowerBody.includes('deal');

  const pendingMeeting = db.prepare(
    "SELECT * FROM scheduled_meetings WHERE thread_id = ? AND status = 'pending'"
  ).get(thread.id);

  if (isMeetingConfirmation && pendingMeeting) {
    return await confirmMeeting(thread, pendingMeeting, listing, settings, platform, buyerContact, threadId);
  }

  // Generate AI response
  const systemPrompt = buildSystemPrompt(listing, settings, thread);
  const userPrompt = buildUserPrompt(body, historyText, listing, thread.listing_id ? null : 'unknown item');

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  const aiReply = response.content[0].text.trim();

  // Check if AI wants to propose meeting times
  const wantsToMeet =
    body.toLowerCase().includes('pick up') ||
    body.toLowerCase().includes('meet') ||
    body.toLowerCase().includes('when') ||
    body.toLowerCase().includes('available') ||
    aiReply.toLowerCase().includes('[propose_times]');

  let finalReply = aiReply.replace('[propose_times]', '').trim();

  if (wantsToMeet) {
    try {
      const slots = await getAvailableSlots(7);
      if (slots.length > 0) {
        const slotsText = formatSlots(slots);
        finalReply += `\n\nI'm available: ${slotsText}. We can meet at ${meetupLocation}. Which works for you?`;

        // Save pending meeting with first proposed slot
        db.prepare(
          `INSERT OR REPLACE INTO scheduled_meetings (thread_id, confirmed_time, status)
           VALUES (?, ?, 'pending')`
        ).run(thread.id, slots[0]);
      }
    } catch (err) {
      console.error('Calendar slot fetch error:', err.message);
    }
  }

  // Send reply via correct platform channel
  await sendReply(platform, { threadId, buyerContact, body: finalReply, listing, thread });

  // Save outbound message
  db.prepare(
    'INSERT INTO messages (thread_id, direction, body, ai_generated) VALUES (?, "outbound", ?, 1)'
  ).run(thread.id, finalReply);
}

async function confirmMeeting(thread, pendingMeeting, listing, settings, platform, buyerContact, threadId) {
  const meetupLocation = settings.meetup_location || 'a public location';

  // Create calendar event
  let calendarEventId = null;
  try {
    calendarEventId = await createMeetingEvent({
      summary: `Sell "${listing?.title || 'item'}" to ${thread.buyer_name}`,
      description: `Platform: ${platform}\nBuyer: ${thread.buyer_name} (${buyerContact})\nListing: ${listing?.title}`,
      startTime: pendingMeeting.confirmed_time,
      location: meetupLocation,
    });
  } catch (err) {
    console.error('Calendar event creation error:', err.message);
  }

  // Update meeting status
  db.prepare(
    'UPDATE scheduled_meetings SET status = "confirmed", calendar_event_id = ? WHERE id = ?'
  ).run(calendarEventId, pendingMeeting.id);

  // Update thread status
  db.prepare("UPDATE message_threads SET status = 'meeting_scheduled' WHERE id = ?").run(thread.id);

  // Send confirmation reply
  const meetDate = new Date(pendingMeeting.confirmed_time).toLocaleString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const confirmMsg = `Perfect! See you ${meetDate} at ${meetupLocation}. I'll have the item ready. Feel free to message if anything changes!`;

  await sendReply(platform, { threadId, buyerContact, body: confirmMsg, listing, thread });
  db.prepare(
    'INSERT INTO messages (thread_id, direction, body, ai_generated) VALUES (?, "outbound", ?, 1)'
  ).run(thread.id, confirmMsg);

  // Mark user notification needed
  db.prepare('UPDATE scheduled_meetings SET notified_user = 0 WHERE id = ?').run(pendingMeeting.id);

  console.log(`\n🔔 MEETING SCHEDULED: "${listing?.title}" with ${thread.buyer_name} at ${meetDate}\n`);
}

async function sendReply(platform, { threadId, buyerContact, body, listing, thread }) {
  if (platform === 'craigslist') {
    // For CL, find the original email thread
    const firstMsg = db.prepare(
      'SELECT * FROM messages WHERE thread_id = ? AND direction = "inbound" ORDER BY sent_at ASC LIMIT 1'
    ).get(thread.id);
    await sendEmailReply({
      to: buyerContact,
      subject: `Re: ${listing?.title || 'Item for sale'}`,
      body,
      threadId,
    });
  } else if (platform === 'ebay') {
    await sendEbayReply({ threadId, body });
  } else if (platform === 'facebook') {
    const threadUrl = `https://www.facebook.com/marketplace/t/${threadId}`;
    await sendFacebookReply({ threadUrl, body });
  }
}

function buildSystemPrompt(listing, settings, thread) {
  const minPrice = thread.min_acceptable_price || listing?.min_acceptable_price;
  const location = settings.meetup_location || 'a public location nearby';

  return `You are a friendly, helpful private seller communicating with potential buyers about a household item for sale.
Keep messages brief, warm, and natural — like texting a neighbor.

Item: ${listing?.title || 'household item'}
Price: $${listing?.price || '(see listing)'}
Condition: ${listing?.condition || 'used'}
Description: ${listing?.description || ''}
${minPrice ? `Minimum acceptable price: $${minPrice} (do not go below this — politely counter-offer)` : ''}
Meetup location: ${location}

Rules:
- Answer questions about the item honestly based on the description
- If asked to lower price: accept if at or above minimum, otherwise counter-offer at minimum
- If buyer asks to meet/pick up: include [propose_times] in your reply so the system appends available slots
- Do NOT include [propose_times] unless buyer is asking about meeting/pickup
- Keep replies under 100 words
- Never invent specs or features not in the description`;
}

function buildUserPrompt(inboundMessage, history, listing, unknownItem) {
  return `Conversation so far:
${history || '(new conversation)'}

New message from buyer: "${inboundMessage}"

Write a brief, natural reply.`;
}
