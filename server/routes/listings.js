import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';
import {
  createListing, getListing, getAllListings,
  updateListing, deleteListing,
  addPhoto, getPhotos, deletePhoto,
} from '../store.js';
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
router.get('/', async (req, res) => {
  try {
    res.json(await getAllListings());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET single listing with photos and platforms
router.get('/:id', async (req, res) => {
  try {
    const listing = await getListing(req.params.id);
    listing.photos = await getPhotos(req.params.id);
    return res.json(listing);
  } catch (err) {
    res.status(404).json({ error: 'Not found' });
  }
});

// POST create listing
router.post('/', async (req, res) => {
  try {
    const { title, description, price, category, condition, min_acceptable_price } = req.body;
    const result = await createListing({ title, description, price, category, condition, min_acceptable_price });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH update listing
router.patch('/:id', async (req, res) => {
  try {
    await updateListing(req.params.id, req.body);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE listing
router.delete('/:id', async (req, res) => {
  try {
    await deleteListing(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST upload photos for a listing
router.post('/:id/photos', upload.array('photos', 10), async (req, res) => {
  const listingId = req.params.id;
  const results = [];

  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const originalPath = `/uploads/${file.filename}`;

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

    const result = await addPhoto(listingId, originalPath, enhancedPath, i);
    results.push({ id: result.id, originalPath, enhancedPath });
  }

  res.json(results);
});

// DELETE a photo
router.delete('/:id/photos/:photoId', async (req, res) => {
  try {
    await deletePhoto(req.params.photoId);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
