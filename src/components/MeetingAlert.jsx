export default function MeetingAlert({ meeting, onDismiss }) {
  const meetDate = meeting.confirmed_time
    ? new Date(meeting.confirmed_time).toLocaleString('en-US', {
        weekday: 'long', month: 'short', day: 'numeric',
        hour: 'numeric', minute: '2-digit',
      })
    : 'TBD';

  return (
    <div className="bg-orange-50 border border-orange-300 rounded-lg p-4 flex items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <span className="text-2xl">📅</span>
        <div>
          <p className="font-semibold text-orange-900">Meetup Scheduled!</p>
          <p className="text-sm text-orange-800 mt-0.5">
            <strong>{meeting.buyer_name}</strong> confirmed to buy{' '}
            <strong>"{meeting.title}"</strong> for ${meeting.price}
          </p>
          <p className="text-sm text-orange-700 mt-0.5">
            {meetDate} · via {meeting.platform}
          </p>
        </div>
      </div>
      <button
        onClick={onDismiss}
        className="text-orange-500 hover:text-orange-700 text-lg leading-none shrink-0"
        title="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}
