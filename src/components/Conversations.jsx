import { useState, useEffect, useCallback } from 'react';

const PLATFORM_ICONS = { ebay: '🛒', craigslist: '📌', facebook: '👥' };
const STATUS_COLORS = {
  active: 'text-blue-600 bg-blue-50',
  meeting_scheduled: 'text-orange-600 bg-orange-50',
  archived: 'text-gray-400 bg-gray-100',
};

export default function Conversations() {
  const [threads, setThreads] = useState([]);
  const [selectedThread, setSelectedThread] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadThreads = useCallback(async () => {
    const res = await fetch('/api/messages/threads');
    setThreads(await res.json());
    setLoading(false);
  }, []);

  const loadMessages = useCallback(async (threadId) => {
    const res = await fetch(`/api/messages/threads/${threadId}/messages`);
    setMessages(await res.json());
  }, []);

  useEffect(() => {
    loadThreads();
    const interval = setInterval(loadThreads, 30000);
    return () => clearInterval(interval);
  }, [loadThreads]);

  useEffect(() => {
    if (selectedThread) loadMessages(selectedThread.id);
  }, [selectedThread, loadMessages]);

  const sendReply = async () => {
    if (!reply.trim() || !selectedThread) return;
    setSending(true);
    await fetch(`/api/messages/threads/${selectedThread.id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: reply }),
    });
    setReply('');
    await loadMessages(selectedThread.id);
    setSending(false);
  };

  if (loading) {
    return <div className="text-center py-16 text-gray-400">Loading conversations...</div>;
  }

  return (
    <div className="flex gap-6 h-[600px]">
      {/* Thread list */}
      <div className="w-72 shrink-0 bg-white rounded-xl border border-gray-200 overflow-y-auto">
        <div className="p-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900">Conversations</h3>
          <p className="text-xs text-gray-400 mt-0.5">AI handles these automatically</p>
        </div>

        {threads.length === 0 ? (
          <div className="p-6 text-center text-gray-400 text-sm">
            No conversations yet.<br />They'll appear here when buyers message you.
          </div>
        ) : (
          threads.map((thread) => (
            <button
              key={thread.id}
              onClick={() => setSelectedThread(thread)}
              className={`w-full text-left p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                selectedThread?.id === thread.id ? 'bg-blue-50' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-sm text-gray-900 truncate">
                  {PLATFORM_ICONS[thread.platform]} {thread.buyer_name || 'Unknown buyer'}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[thread.status] || ''}`}>
                  {thread.status === 'meeting_scheduled' ? '📅 meetup' : thread.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 truncate mt-0.5">
                {thread.listing_title || 'Unknown item'}
              </p>
              <p className="text-xs text-gray-400 truncate mt-1">
                {thread.last_message || '—'}
              </p>
            </button>
          ))
        )}
      </div>

      {/* Message view */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 flex flex-col">
        {!selectedThread ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            Select a conversation
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-900">
                  {PLATFORM_ICONS[selectedThread.platform]} {selectedThread.buyer_name}
                </h3>
                <p className="text-xs text-gray-500">
                  {selectedThread.listing_title} · ${selectedThread.listing_price}
                </p>
              </div>
              {selectedThread.meeting_status === 'confirmed' && selectedThread.confirmed_time && (
                <div className="text-sm text-orange-700 bg-orange-50 border border-orange-200 rounded-lg px-3 py-1.5">
                  📅 Meetup: {new Date(selectedThread.confirmed_time).toLocaleString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                  })}
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-sm rounded-2xl px-4 py-2.5 text-sm ${
                      msg.direction === 'outbound'
                        ? 'bg-blue-600 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-blue-200' : 'text-gray-400'}`}>
                      {new Date(msg.sent_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      {msg.ai_generated && msg.direction === 'outbound' && ' · AI'}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Reply input */}
            <div className="p-4 border-t border-gray-100 flex gap-2">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder="Override AI — type a manual reply..."
                className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendReply}
                disabled={sending || !reply.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                Send
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
