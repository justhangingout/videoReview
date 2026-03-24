import { useState, useEffect } from 'react';
import PlatformBadge from './PlatformBadge.jsx';

const PLATFORMS = [
  { id: 'ebay', label: 'eBay', icon: '🛒', desc: 'Posted via eBay Sell API' },
  { id: 'craigslist', label: 'Craigslist', icon: '📌', desc: 'Browser automation' },
  { id: 'facebook', label: 'Facebook Marketplace', icon: '👥', desc: 'Browser automation' },
];

const CONDITIONS = ['new', 'like_new', 'good', 'fair', 'poor'];

export default function ListingEditor({ listingId, onDone }) {
  const [listing, setListing] = useState(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [platformDescriptions, setPlatformDescriptions] = useState(null);
  const [generatingDescs, setGeneratingDescs] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetch(`/api/listings/${listingId}`)
      .then((r) => r.json())
      .then((data) => {
        setListing(data);
        setLoading(false);
      });
  }, [listingId]);

  const update = (field, value) => {
    setListing((prev) => ({ ...prev, [field]: value }));
  };

  const save = async () => {
    setSaving(true);
    await fetch(`/api/listings/${listingId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: listing.title,
        description: listing.description,
        price: listing.price,
        category: listing.category,
        condition: listing.condition,
        min_acceptable_price: listing.min_acceptable_price,
      }),
    });
    setSaving(false);
    setSuccess('Saved!');
    setTimeout(() => setSuccess(''), 2000);
  };

  const generatePlatformDescriptions = async () => {
    setGeneratingDescs(true);
    try {
      const res = await fetch('/api/ai/platform-descriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json();
      setPlatformDescriptions(data);
    } catch (err) {
      setError('Failed to generate descriptions');
    }
    setGeneratingDescs(false);
  };

  const postNow = async () => {
    if (!selectedPlatforms.length) {
      setError('Select at least one platform to post to.');
      return;
    }

    await save();
    setPosting(true);
    setError('');

    const automationPlatforms = selectedPlatforms.filter((p) => p !== 'ebay');
    const promises = [];

    if (selectedPlatforms.includes('ebay')) {
      promises.push(
        fetch('/api/ebay/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId }),
        })
      );
    }

    if (automationPlatforms.length) {
      promises.push(
        fetch('/api/automation/post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ listingId, platforms: automationPlatforms }),
        })
      );
    }

    await Promise.all(promises);
    setPosting(false);
    setSuccess('Posted! Check Dashboard for status updates.');

    // Refresh listing status
    const res = await fetch(`/api/listings/${listingId}`);
    setListing(await res.json());
  };

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Loading listing...</div>;
  }

  const postedPlatforms = listing.platforms || [];

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900">Edit & Post Listing</h2>
        <button
          onClick={onDone}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Back to Dashboard
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">{success}</div>
      )}

      {/* Photos */}
      {listing.photos?.length > 0 && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Photos</label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {listing.photos.map((photo) => (
              <div key={photo.id} className="w-24 h-24 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                <img
                  src={photo.enhanced_path || photo.original_path}
                  alt=""
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-green-600 mt-1">✓ Images have been enhanced for listings</p>
        </div>
      )}

      {/* Core fields */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input
            value={listing.title || ''}
            onChange={(e) => update('title', e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            maxLength={100}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price ($)</label>
            <input
              type="number"
              value={listing.price || ''}
              onChange={(e) => update('price', parseFloat(e.target.value))}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min. Acceptable ($)</label>
            <input
              type="number"
              value={listing.min_acceptable_price || ''}
              onChange={(e) => update('min_acceptable_price', parseFloat(e.target.value))}
              placeholder="For AI negotiation"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input
              value={listing.category || ''}
              onChange={(e) => update('category', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Condition</label>
            <select
              value={listing.condition || 'good'}
              onChange={(e) => update('condition', e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>{c.replace('_', ' ')}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            value={listing.description || ''}
            onChange={(e) => update('description', e.target.value)}
            rows={5}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
      </div>

      {/* Platform-specific descriptions */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Platform-Specific Descriptions</h3>
          <button
            onClick={generatePlatformDescriptions}
            disabled={generatingDescs}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50"
          >
            {generatingDescs ? '⏳ Generating...' : '✨ Generate with AI'}
          </button>
        </div>
        {platformDescriptions ? (
          <div className="space-y-3">
            {Object.entries(platformDescriptions).map(([platform, desc]) => (
              <div key={platform}>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  {platform}
                </label>
                <p className="mt-1 text-sm text-gray-700 bg-gray-50 rounded-lg p-3">{desc}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">
            Generate tailored descriptions for each platform's tone and format.
          </p>
        )}
      </div>

      {/* Platform selection */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-3">Post to Platforms</h3>

        {/* Already posted */}
        {postedPlatforms.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            {postedPlatforms.map((p, i) => (
              <PlatformBadge key={i} platform={p.platform} status={p.status} url={p.url} />
            ))}
          </div>
        )}

        <div className="space-y-2">
          {PLATFORMS.map((p) => {
            const alreadyPosted = postedPlatforms.find(
              (pp) => pp.platform === p.id && pp.status === 'live'
            );
            return (
              <label
                key={p.id}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  selectedPlatforms.includes(p.id)
                    ? 'border-blue-400 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                } ${alreadyPosted ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={selectedPlatforms.includes(p.id)}
                  disabled={!!alreadyPosted}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedPlatforms((prev) => [...prev, p.id]);
                    else setSelectedPlatforms((prev) => prev.filter((x) => x !== p.id));
                  }}
                  className="rounded"
                />
                <span className="text-xl">{p.icon}</span>
                <div>
                  <div className="font-medium text-sm text-gray-900">
                    {p.label}
                    {alreadyPosted && <span className="ml-2 text-green-600 text-xs">✓ Live</span>}
                  </div>
                  <div className="text-xs text-gray-400">{p.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving...' : 'Save Draft'}
        </button>
        <button
          onClick={postNow}
          disabled={posting || !selectedPlatforms.length}
          className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {posting ? '⏳ Posting...' : `🚀 Post to ${selectedPlatforms.length || 0} platform${selectedPlatforms.length !== 1 ? 's' : ''}`}
        </button>
      </div>

      <p className="text-xs text-gray-400 text-center">
        Craigslist and Facebook will open a visible browser window for automation.
        eBay posts via API instantly.
      </p>
    </div>
  );
}
