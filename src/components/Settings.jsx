import { useState, useEffect } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [googleStatus, setGoogleStatus] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [windows, setWindows] = useState([]);

  useEffect(() => {
    Promise.all([
      fetch('/api/settings').then((r) => r.json()),
      fetch('/auth/google/status').then((r) => r.json()),
    ]).then(([s, g]) => {
      setSettings(s);
      setGoogleStatus(g);
      setWindows(s.available_windows || [
        { days: [1, 2, 3, 4, 5], after: '18:00', before: '22:00' },
        { days: [0, 6], after: '08:00', before: '20:00' },
      ]);
    });
  }, []);

  const save = async () => {
    setSaving(true);
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...settings, available_windows: windows }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const updateWindow = (i, field, value) => {
    setWindows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [field]: value };
      return next;
    });
  };

  const toggleDay = (winIdx, day) => {
    setWindows((prev) => {
      const next = [...prev];
      const days = next[winIdx].days.includes(day)
        ? next[winIdx].days.filter((d) => d !== day)
        : [...next[winIdx].days, day].sort();
      next[winIdx] = { ...next[winIdx], days };
      return next;
    });
  };

  const addWindow = () => {
    setWindows((prev) => [...prev, { days: [6], after: '09:00', before: '17:00' }]);
  };

  const removeWindow = (i) => {
    setWindows((prev) => prev.filter((_, idx) => idx !== i));
  };

  if (!settings) {
    return <div className="text-center py-16 text-gray-400">Loading settings...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-2xl font-bold text-gray-900">Settings</h2>

      {/* Google Auth */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Google Account</h3>
        <p className="text-sm text-gray-500 mb-4">
          Required for Gmail (Craigslist replies) and Google Calendar (availability checking).
        </p>
        {googleStatus?.connected ? (
          <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
            <span>✅</span>
            <span className="text-sm font-medium">Google Calendar & Gmail connected</span>
          </div>
        ) : (
          <a
            href="/auth/google"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            🔗 Connect Google Account
          </a>
        )}
      </div>

      {/* Meetup location */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Public Meetup Location</h3>
        <p className="text-sm text-gray-500 mb-3">
          AI will include this location when proposing meeting times to buyers.
        </p>
        <input
          value={settings.meetup_location || ''}
          onChange={(e) => setSettings((s) => ({ ...s, meetup_location: e.target.value }))}
          placeholder="e.g., Starbucks at 123 Main St, Springfield"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Availability windows */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Availability for Meetups</h3>
        <p className="text-sm text-gray-500 mb-4">
          AI will only propose meeting times within these windows. Existing calendar events are automatically excluded.
        </p>

        <div className="space-y-4">
          {windows.map((win, i) => (
            <div key={i} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-gray-700">Window {i + 1}</span>
                <button
                  onClick={() => removeWindow(i)}
                  className="text-red-400 hover:text-red-600 text-sm"
                >
                  Remove
                </button>
              </div>

              {/* Day selector */}
              <div className="flex gap-1 mb-3">
                {DAYS.map((day, dayIdx) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(i, dayIdx)}
                    className={`flex-1 py-1 text-xs rounded-md border transition-colors ${
                      win.days.includes(dayIdx)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-500 border-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>

              {/* Time range */}
              <div className="flex items-center gap-3 text-sm">
                <label className="text-gray-500 shrink-0">From</label>
                <input
                  type="time"
                  value={win.after}
                  onChange={(e) => updateWindow(i, 'after', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="text-gray-500 shrink-0">to</label>
                <input
                  type="time"
                  value={win.before}
                  onChange={(e) => updateWindow(i, 'before', e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          ))}
        </div>

        <button
          onClick={addWindow}
          className="mt-3 text-sm text-blue-600 hover:text-blue-800"
        >
          + Add another time window
        </button>
      </div>

      {/* Craigslist city */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="font-semibold text-gray-900 mb-1">Craigslist City</h3>
        <p className="text-sm text-gray-500 mb-3">
          The Craigslist subdomain for your area (e.g., <code className="bg-gray-100 px-1 rounded">sfbay</code>, <code className="bg-gray-100 px-1 rounded">chicago</code>, <code className="bg-gray-100 px-1 rounded">newyork</code>).
        </p>
        <input
          value={settings.craigslist_city || ''}
          onChange={(e) => setSettings((s) => ({ ...s, craigslist_city: e.target.value }))}
          placeholder="sfbay"
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Save */}
      <button
        onClick={save}
        disabled={saving}
        className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Settings'}
      </button>
    </div>
  );
}
