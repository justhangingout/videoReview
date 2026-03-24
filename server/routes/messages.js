import express from 'express';
import db from '../db.js';
import { handleInboundMessage } from '../services/messageHandler.js';

const router = express.Router();

// GET all message threads
router.get('/threads', (req, res) => {
  const threads = db.prepare(
    `SELECT mt.*, l.title as listing_title, l.price as listing_price,
       (SELECT COUNT(*) FROM messages m WHERE m.thread_id = mt.id) as message_count,
       (SELECT body FROM messages m WHERE m.thread_id = mt.id ORDER BY sent_at DESC LIMIT 1) as last_message,
       sm.confirmed_time, sm.status as meeting_status
     FROM message_threads mt
     LEFT JOIN listings l ON l.id = mt.listing_id
     LEFT JOIN scheduled_meetings sm ON sm.thread_id = mt.id AND sm.status = 'confirmed'
     ORDER BY mt.created_at DESC`
  ).all();
  res.json(threads);
});

// GET messages in a thread
router.get('/threads/:id/messages', (req, res) => {
  const messages = db.prepare(
    'SELECT * FROM messages WHERE thread_id = ? ORDER BY sent_at ASC'
  ).all(req.params.id);
  res.json(messages);
});

// POST manually send a message (override AI)
router.post('/threads/:id/reply', async (req, res) => {
  const { body } = req.body;
  const thread = db.prepare('SELECT * FROM message_threads WHERE id = ?').get(req.params.id);
  if (!thread) return res.status(404).json({ error: 'Thread not found' });

  const listing = thread.listing_id
    ? db.prepare('SELECT * FROM listings WHERE id = ?').get(thread.listing_id)
    : null;

  try {
    // Send via platform
    if (thread.platform === 'craigslist') {
      const { sendEmailReply } = await import('../services/gmail.js');
      await sendEmailReply({
        to: thread.buyer_contact,
        subject: `Re: ${listing?.title || 'Item for sale'}`,
        body,
        threadId: thread.thread_id,
      });
    } else if (thread.platform === 'ebay') {
      const { sendEbayReply } = await import('../services/ebayMessages.js');
      await sendEbayReply({ threadId: thread.thread_id, body });
    } else if (thread.platform === 'facebook') {
      const { sendFacebookReply } = await import('../services/facebookMessages.js');
      await sendFacebookReply({
        threadUrl: `https://www.facebook.com/marketplace/t/${thread.thread_id}`,
        body,
      });
    }

    db.prepare(
      'INSERT INTO messages (thread_id, direction, body, ai_generated) VALUES (?, "outbound", ?, 0)'
    ).run(thread.id, body);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET pending meeting notifications
router.get('/meetings/pending', (req, res) => {
  const meetings = db.prepare(
    `SELECT sm.*, mt.buyer_name, mt.platform, l.title, l.price
     FROM scheduled_meetings sm
     JOIN message_threads mt ON mt.id = sm.thread_id
     LEFT JOIN listings l ON l.id = mt.listing_id
     WHERE sm.notified_user = 0 AND sm.status = 'confirmed'`
  ).all();
  res.json(meetings);
});

// PATCH dismiss meeting notification
router.patch('/meetings/:id/dismiss', (req, res) => {
  db.prepare('UPDATE scheduled_meetings SET notified_user = 1 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

export default router;
