import sharp from 'sharp';

/**
 * Enhance an image for marketplace listings:
 * - Auto-normalize exposure
 * - Increase contrast slightly
 * - Sharpen for clarity
 * - Output as JPEG optimized for listings
 */
export async function enhanceImage(inputPath, outputPath, options = {}) {
  const { maxWidth = 2000, quality = 88 } = options;

  await sharp(inputPath)
    .rotate() // auto-rotate based on EXIF orientation
    .normalise() // auto levels (stretch histogram)
    .modulate({ brightness: 1.05, saturation: 1.1 }) // slight boost
    .sharpen({ sigma: 1.2, m1: 0.5, m2: 3 })
    .resize(maxWidth, maxWidth, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality, mozjpeg: true })
    .toFile(outputPath);
}

/**
 * Resize for a specific platform's requirements
 */
export async function resizeForPlatform(inputPath, outputPath, platform) {
  const sizes = {
    ebay: { maxWidth: 1600, quality: 85 },
    craigslist: { maxWidth: 1200, quality: 80 },
    facebook: { maxWidth: 1200, quality: 80 },
  };
  const opts = sizes[platform] || sizes.facebook;
  await enhanceImage(inputPath, outputPath, opts);
}
