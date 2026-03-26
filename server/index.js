import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import listingsRouter from './routes/listings.js';
import aiRouter from './routes/ai.js';
import ebayRouter from './routes/ebay.js';
import automationRouter from './routes/automation.js';
import messagesRouter from './routes/messages.js';
import settingsRouter from './routes/settings.js';
import authRouter from './routes/auth.js';
import { initDefaultSettings } from './store.js';

// Start background message poller
import './services/poller.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve uploaded and enhanced images statically
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
app.use('/enhanced', express.static(path.join(__dirname, '..', 'enhanced')));

// API routes
app.use('/api/listings', listingsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/ebay', ebayRouter);
app.use('/api/automation', automationRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/settings', settingsRouter);
app.use('/auth', authRouter);

app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  // Seed Notion settings with defaults (no-ops if already set)
  try { await initDefaultSettings(); }
  catch (err) { console.warn('Could not init Notion settings:', err.message); }
});
