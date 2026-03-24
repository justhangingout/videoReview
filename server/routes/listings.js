import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import db from '../db.js';
import { enhanceImage } from '../services/imageEnhancer.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const router = express.Router();

const storage = multer.diskStorage({
  destination: path.join(__dirname, '..', '..', 'uploads'),
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// GET all listings with platform statuses
router.get('/', (req, res) => {
  const listings = db
    .prepare(
      `SELECT l.*,
        json_group_array(
          json_object('platform', pl.platform, 'status', pl.status, 'url', pl.url, 'error', pl.error)
        ) FILTER (WHERE pl.id IS NOT NULL) as platforms
       FROM listings l
       LEFT JOIN platform_listings pl ON pl.listing_id = l.id
       GROUP BY l.id
       ORDER BY l.created_at DESC`
    )
    .all();

  const result = listings.map((l) => ({
    ...l,
    platforms: JSON.parse(l.platforms || '[]'),
  }));
  res.json(result);
});

// GET single listing with photos and platforms
router.get('/:id', (req, res) => {
  const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Not found' });

  listing.photos = db
    .prepare('SELECT * FROM listing_photos WHERE listing_id = ? ORDER BY display_order')
    .all(req.params.id);
  listing.platforms = db
    .prepare('SELECT * FROM platform_listings WHERE listing_id = ?')
    .all(req.params.id);

  res.json(listing);
});

// POST create listing
router.post('/', (req, res) => {
  const { title, description, price, category, condition, min_acceptable_price } = req.body;
  const result = db
    .prepare(
      `INSERT INTO listings (title, description, price, category, condition, min_acceptable_price)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(title, description, price, category, condition || 'used', min_acceptable_price || null);

  res.json({ id: result.lastInsertRowid });
});

// PATCH update listing
router.patch('/:id', (req, res) => {
  const fields = ['title', 'description', 'price', 'category', 'condition', 'min_acceptable_price', 'status'];
  const updates = [];
  const values = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(req.body[f]);
    }
  }
  if (!updates.length) return res.json({ ok: true });

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(req.params.id);

  db.prepare(`UPDATE listings SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

// DELETE listing
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM listings WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST upload photos for a listing
router.post('/:id/photos', upload.array('photos', 10), async (req, res) => {
  const listingId = req.params.id;
  const results = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const originalPath = `/uploads/${file.filename}`;

    // Enhance the image
    let enhancedPath = null;
    try {
      const enhancedFilename = `enhanced_${file.filename}`;
      await enhanceImage(
        path.join(__dirname, '..', '..', 'uploads', file.filename),
        path.join(__dirname, '..', '..', 'enhanced', enhancedFilename)
      );
      enhancedPath = `/enhanced/${enhancedFilename}`;
    } catch (err) {
      console.error('Image enhancement failed:', err.message);
    }

    const result = db
      .prepare(
        'INSERT INTO listing_photos (listing_id, original_path, enhanced_path, display_order) VALUES (?, ?, ?, ?)'
      )
      .run(listingId, originalPath, enhancedPath, i);

    results.push({ id: result.lastInsertRowid, originalPath, enhancedPath });
  }

  res.json(results);
});

// DELETE a photo
router.delete('/:id/photos/:photoId', (req, res) => {
  db.prepare('DELETE FROM listing_photos WHERE id = ? AND listing_id = ?').run(
    req.params.photoId,
    req.params.id
  );
  res.json({ ok: true });
});

export default router;
