import { useState, useEffect, useCallback } from 'react';
import PlatformBadge from './PlatformBadge.jsx';

export default function Dashboard({ onEdit }) {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/listings');
      setListings(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000); // Refresh every 15s for status updates
    return () => clearInterval(interval);
  }, [load]);

  const deleteListing = async (id) => {
    if (!confirm('Delete this listing?')) return;
    await fetch(`/api/listings/${id}`, { method: 'DELETE' });
    setListings((prev) => prev.filter((l) => l.id !== id));
  };

  const filtered = listings.filter((l) => {
    if (filter === 'all') return true;
    if (filter === 'active') return l.platforms?.some((p) => p.status === 'live');
    if (filter === 'draft') return l.status === 'draft';
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 text-gray-400">
        Loading listings...
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Your Listings</h2>
        <div className="flex gap-2">
          {['all', 'active', 'draft'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-5xl mb-3">📦</p>
          <p className="text-lg font-medium">No listings yet</p>
          <p className="text-sm mt-1">Click "New Listing" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onEdit={() => onEdit(listing.id)}
              onDelete={() => deleteListing(listing.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ListingCard({ listing, onEdit, onDelete }) {
  const activePlatforms = listing.platforms || [];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-start gap-4 hover:border-gray-300 transition-colors">
      {/* Photo */}
      <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden shrink-0">
        {listing.photo ? (
          <img src={listing.photo} alt={listing.title} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-gray-300 text-2xl">📷</div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 truncate">
            {listing.title || <span className="text-gray-400 italic">Untitled draft</span>}
          </h3>
          <span className="text-lg font-bold text-gray-900 shrink-0">
            {listing.price ? `$${listing.price}` : '—'}
          </span>
        </div>

        <p className="text-sm text-gray-500 mt-0.5 truncate">{listing.category || 'No category'}</p>

        <div className="flex flex-wrap gap-1.5 mt-2">
          {activePlatforms.length === 0 && (
            <span className="text-xs text-gray-400 italic">Not posted yet</span>
          )}
          {activePlatforms.map((p, i) => (
            <PlatformBadge key={i} platform={p.platform} status={p.status} url={p.url} />
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-2 shrink-0">
        <button
          onClick={onEdit}
          className="px-3 py-1.5 text-sm bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors"
        >
          Edit / Post
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-1.5 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
