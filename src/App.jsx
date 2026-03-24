import { useState, useEffect, useCallback } from 'react';
import Dashboard from './components/Dashboard.jsx';
import NewListing from './components/NewListing.jsx';
import ListingEditor from './components/ListingEditor.jsx';
import Conversations from './components/Conversations.jsx';
import Settings from './components/Settings.jsx';
import MeetingAlert from './components/MeetingAlert.jsx';

const TABS = ['Dashboard', 'New Listing', 'Conversations', 'Settings'];

export default function App() {
  const [activeTab, setActiveTab] = useState('Dashboard');
  const [editingListingId, setEditingListingId] = useState(null);
  const [meetingAlerts, setMeetingAlerts] = useState([]);

  // Poll for meeting notifications
  const checkMeetings = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/meetings/pending');
      const data = await res.json();
      if (data.length) setMeetingAlerts(data);
    } catch { /* server may not be ready */ }
  }, []);

  useEffect(() => {
    checkMeetings();
    const interval = setInterval(checkMeetings, 30000);
    return () => clearInterval(interval);
  }, [checkMeetings]);

  const dismissMeeting = async (id) => {
    await fetch(`/api/messages/meetings/${id}/dismiss`, { method: 'PATCH' });
    setMeetingAlerts((prev) => prev.filter((m) => m.id !== id));
  };

  const handleEditListing = (id) => {
    setEditingListingId(id);
    setActiveTab('Editor');
  };

  const handleEditorDone = () => {
    setEditingListingId(null);
    setActiveTab('Dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold">ML</span>
          </div>
          <h1 className="text-xl font-semibold text-gray-900">Marketplace Lister</h1>
        </div>
        {meetingAlerts.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
            {meetingAlerts.length} meetup{meetingAlerts.length > 1 ? 's' : ''} scheduled!
          </div>
        )}
      </header>

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200 px-6">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => { setActiveTab(tab); setEditingListingId(null); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab}
              {tab === 'Conversations' && meetingAlerts.length > 0 && (
                <span className="ml-2 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">
                  {meetingAlerts.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </nav>

      {/* Meeting alerts */}
      {meetingAlerts.length > 0 && (
        <div className="max-w-4xl mx-auto mt-4 px-6 space-y-2">
          {meetingAlerts.map((m) => (
            <MeetingAlert key={m.id} meeting={m} onDismiss={() => dismissMeeting(m.id)} />
          ))}
        </div>
      )}

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-6 py-6">
        {activeTab === 'Dashboard' && (
          <Dashboard onEdit={handleEditListing} />
        )}
        {activeTab === 'New Listing' && (
          <NewListing onCreated={(id) => { setEditingListingId(id); setActiveTab('Editor'); }} />
        )}
        {activeTab === 'Editor' && editingListingId && (
          <ListingEditor listingId={editingListingId} onDone={handleEditorDone} />
        )}
        {activeTab === 'Conversations' && (
          <Conversations />
        )}
        {activeTab === 'Settings' && (
          <Settings />
        )}
      </main>
    </div>
  );
}
