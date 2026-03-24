import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, '..', 'listings.db'));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    description TEXT,
    price REAL,
    category TEXT,
    condition TEXT DEFAULT 'used',
    status TEXT DEFAULT 'draft',
    min_acceptable_price REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS listing_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    original_path TEXT NOT NULL,
    enhanced_path TEXT,
    display_order INTEGER DEFAULT 0,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS platform_listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    platform TEXT NOT NULL,
    external_id TEXT,
    status TEXT DEFAULT 'pending',
    url TEXT,
    error TEXT,
    posted_at DATETIME,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS message_threads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    platform TEXT NOT NULL,
    thread_id TEXT NOT NULL,
    buyer_name TEXT,
    buyer_contact TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (listing_id) REFERENCES listings(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    direction TEXT NOT NULL,
    body TEXT NOT NULL,
    sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    ai_generated INTEGER DEFAULT 1,
    FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS scheduled_meetings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id INTEGER NOT NULL,
    confirmed_time DATETIME,
    calendar_event_id TEXT,
    status TEXT DEFAULT 'pending',
    notified_user INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (thread_id) REFERENCES message_threads(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Seed default settings if not present
const defaults = {
  meetup_location: '',
  available_windows: JSON.stringify([
    { days: [1, 2, 3, 4, 5], after: '18:00', before: '22:00' },
    { days: [0, 6], after: '08:00', before: '20:00' },
  ]),
  craigslist_city: 'sfbay',
  notify_email: '',
};

const upsertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [key, value] of Object.entries(defaults)) {
  upsertSetting.run(key, value);
}

export default db;
