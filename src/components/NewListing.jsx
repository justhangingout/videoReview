import { useState, useRef } from 'react';

export default function NewListing({ onCreated }) {
  const [photos, setPhotos] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [listingId, setListingId] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef(null);

  const handleFileSelect = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;

    setPhotos(files);
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    setError('');
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    setPhotos(files);
    setPreviews(files.map((f) => URL.createObjectURL(f)));
  };

  const handleAnalyze = async () => {
    if (!photos.length) {
      setError('Please select at least one photo first.');
      return;
    }

    setError('');
    setUploading(true);

    try {
      // Step 1: Create a blank listing
      const createRes = await fetch('/api/listings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: '', description: '', price: 0 }),
      });
      const { id } = await createRes.json();
      setListingId(id);

      // Step 2: Upload photos
      const formData = new FormData();
      photos.forEach((f) => formData.append('photos', f));
      await fetch(`/api/listings/${id}/photos`, { method: 'POST', body: formData });

      setUploading(false);
      setAnalyzing(true);

      // Step 3: Analyze with AI
      const analyzeRes = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: id }),
      });

      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || 'AI analysis failed');
      }

      // Move to editor
      onCreated(id);
    } catch (err) {
      setError(err.message);
      setAnalyzing(false);
      setUploading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-900 mb-2">New Listing</h2>
      <p className="text-gray-500 mb-6">
        Upload photos of your item — AI will generate the title, description, and suggested price automatically.
      </p>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => fileRef.current?.click()}
        className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileSelect}
        />
        {previews.length === 0 ? (
          <>
            <p className="text-4xl mb-3">📸</p>
            <p className="font-medium text-gray-700">Drop photos here or click to select</p>
            <p className="text-sm text-gray-400 mt-1">JPEG, PNG, HEIC · Up to 10 photos · 20MB each</p>
          </>
        ) : (
          <div className="grid grid-cols-4 gap-2">
            {previews.map((url, i) => (
              <div key={i} className="aspect-square rounded-lg overflow-hidden bg-gray-100">
                <img src={url} alt="" className="w-full h-full object-cover" />
              </div>
            ))}
            <div className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 text-2xl">
              +
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {photos.length > 0 && (
        <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
          ✨ Images will be enhanced automatically (brightness, sharpness, optimized for each platform)
        </div>
      )}

      <button
        onClick={handleAnalyze}
        disabled={!photos.length || uploading || analyzing}
        className="mt-6 w-full py-3 px-6 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {uploading ? '⏫ Uploading & enhancing photos...' :
         analyzing ? '🤖 AI is analyzing your item...' :
         '✨ Analyze with AI'}
      </button>
    </div>
  );
}
