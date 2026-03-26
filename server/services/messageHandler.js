import Anthropic from '@anthropic-ai/sdk';
import {
  getThread, getThreadByPlatformId, createThread,
  getListing, getPlatformListingByExternalId,
  createMessage, getMessages,
  getPendingMeeting, createMeeting, updateMeeting, updateThread,
  getAllSettings,
} from '../store.js';
import { getAvailableSlots, formatSlots, createMeetingEvent } from './calendar.js';
import { sendEmailReply } from './gmail.js';
import { sendEbayReply } from './ebayMessages.js';
import { sendFacebookReply } from './facebookMessages.js';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function handleInboundMessage({ platform, threadId, buyerName, buyerContact, body, itemId }) {
  // Find or create the conversation thread
  let thread = await getThreadByPlatformId(platform, threadId);

  if (!thread) {
    const platformListing = itemId
      ? await getPlatformListingByExternalId(platform, itemId)
      : null;

    thread = await createThread({
      listing_id:    platformListing?.listing_id ?? null,
      platform,
      thread_id:     threadId,
      buyer_name:    buyerName,
      buyer_contact: buyerContact,
    });
  }

  if (thread.status === 'archived' || thread.status === 'meeting_scheduled') return;

  // Save inbound message
  await createMessage(thread.id, 'inbound', body, false);

  // Load listing context
  const listing = thread.listing_id
    ? await getListing(thread.listing_id).catch(() => null)
    : null;

  // Load settings
  const settings = await getAllSettings();
  const meetupLocation = settings.meetup_location || 'a public location';

  // Conversation history for context
  const history = await getMessages(thread.id);
  const historyText = history
    .map((m) => `${m.direction === 'inbound' ? 'Buyer' : 'Seller'}: ${m.body}`)
    .join('\n');

  // Check if this looks like a meeting confirmation
  const lowerBody = body.toLowerCase();
  const isMeetingConfirmation = [
    'works for me', 'that works', 'sounds good', "i'll be there",
    'see you', 'confirmed', 'deal', 'perfect',
  ].some((p) => lowerBody.includes(p));

  const pendingMeeting = await getPendingMeeting(thread.id);

  if (isMeetingConfirmation && pendingMeeting) {
    await confirmMeeting(thread, pendingMeeting, listing, meetupLocation, platform, buyerContact, threadId);
    return;
  }

  // Build prompt and generate AI reply
  const systemPrompt = buildSystemPrompt(listing, settings, thread);
  const userPrompt   = `Conversation so far:\n${historyText || '(new conversation)'}\n\nNew message from buyer: "${body}"\n\nWrite a brief, natural reply.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
  });

  let aiReply = response.content[0].text.trim();

  // If buyer is asking about meeting, append available slots
  const wantsToMeet = lowerBody.includes('pick up') || lowerBody.includes('meet') ||
    lowerBody.includes('when') || lowerBody.includes('available') ||
    aiReply.includes('[propose_times]');

  aiReply = aiReply.replace('[propose_times]', '').trim();

  if (wantsToMeet) {
    try {
      const slots = await getAvailableSlots(7);
      if (slots.length > 0) {
        aiReply += `\n\nI'm available: ${formatSlots(slots)}. We can meet at ${meetupLocation}. Which works for you?`;
        // Record pending meeting with first proposed slot
        await createMeeting(thread.id, slots[0]);
      }
    } catch (err) {
      console.error('Calendar slot fetch error:', err.message);
    }
  }

  await sendReply(platform, { threadId, buyerContact, body: aiReply, listing, thread });
  await createMessage(thread.id, 'outbound', aiReply, true);
}

async function confirmMeeting(thread, pendingMeeting, listing, meetupLocation, platform, buyerContact, threadId) {
  let calendarEventId = null;
  try {
    calendarEventId = await createMeetingEvent({
      summary:     `Sell "${listing?.title || 'item'}" to ${thread.buyer_name}`,
      description: `Platform: ${platform}\nBuyer: ${thread.buyer_name} (${buyerContact})\nItem: ${listing?.title}`,
      startTime:   pendingMeeting.confirmed_time,
      location:    meetupLocation,
    });
  } catch (err) {
    console.error('Calendar event error:', err.message);
  }

  await updateMeeting(pendingMeeting.id, { status: 'confirmed', calendar_event_id: calendarEventId, notified_user: false });
  await updateThread(thread.id, { status: 'meeting_scheduled' });

  const meetDate = new Date(pendingMeeting.confirmed_time).toLocaleString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const confirmMsg = `Perfect! See you ${meetDate} at ${meetupLocation}. I'll have the item ready. Feel free to message if anything changes!`;

  await sendReply(platform, { threadId, buyerContact, body: confirmMsg, listing, thread });
  await createMessage(thread.id, 'outbound', confirmMsg, true);

  console.log(`\n🔔 MEETING SCHEDULED: "${listing?.title}" with ${thread.buyer_name} at ${meetDate}\n`);
}

async function sendReply(platform, { threadId, buyerContact, body, listing, thread }) {
  if (platform === 'craigslist') {
    await sendEmailReply({
      to:       buyerContact,
      subject:  `Re: ${listing?.title || 'Item for sale'}`,
      body,
      threadId,
    });
  } else if (platform === 'ebay') {
    await sendEbayReply({ threadId, body });
  } else if (platform === 'facebook') {
    await sendFacebookReply({ threadUrl: `https://www.facebook.com/marketplace/t/${threadId}`, body });
  }
}

function buildSystemPrompt(listing, settings, thread) {
  const minPrice = listing?.min_acceptable_price;
  const location = settings.meetup_location || 'a public location nearby';

  return `You are a friendly private seller texting with a potential buyer.

Item: ${listing?.title || 'household item'}
Price: $${listing?.price || '(see listing)'}
Condition: ${listing?.condition || 'used'}
Description: ${listing?.description || ''}
${minPrice ? `Minimum acceptable price: $${minPrice} (politely counter if buyer goes below this)` : ''}
Meetup location: ${location}

Rules:
- Answer questions honestly based on the description
- If buyer offers below minimum: counter at the minimum price
- If buyer asks about meeting/pickup: include [propose_times] in reply so the system appends open slots
- Keep replies under 100 words
- Do NOT invent specs not mentioned in the description`;
}
