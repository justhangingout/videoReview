import express from 'express';
import {
  getAllThreads, getThread, getMessages, createMessage,
  getPendingMeetingsForDashboard, updateMeeting, getListing,
} from '../store.js';

const router = express.Router();

// GET all message threads (enriched with listing info, last message, meeting)
router.get('/threads', async (req, res) => {
  try {
    res.json(await getAllThreads());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET messages in a thread
router.get('/threads/:id/messages', async (req, res) => {
  try {
    res.json(await getMessages(req.params.id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST manually send a reply (overrides AI)
router.post('/threads/:id/reply', async (req, res) => {
  const { body } = req.body;
  try {
    const thread = await getThread(req.params.id);
    const listing = thread.listing_id ? await getListing(thread.listing_id).catch(() => null) : null;

    if (thread.platform === 'craigslist') {
      const { sendEmailReply } = await import('../services/gmail.js');
      await sendEmailReply({
        to:       thread.buyer_contact,
        subject:  `Re: ${listing?.title || 'Item for sale'}`,
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

    await createMessage(thread.id, 'outbound', body, false);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET pending meeting notifications (unnotified + confirmed)
router.get('/meetings/pending', async (req, res) => {
  try {
    res.json(await getPendingMeetingsForDashboard());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH dismiss a meeting notification
router.patch('/meetings/:id/dismiss', async (req, res) => {
  try {
    await updateMeeting(req.params.id, { notified_user: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
