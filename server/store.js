/**
 * Notion-backed data store.
 * All DB operations go through this module — no SQLite anywhere.
 *
 * Notion databases are created once via: node server/setupNotion.js
 * Their IDs are stored in .env as NOTION_*_DB variables.
 */
import { Client } from '@notionhq/client';

export const notion = new Client({ auth: process.env.NOTION_TOKEN });

const DB = {
  listings:        process.env.NOTION_LISTINGS_DB,
  photos:          process.env.NOTION_PHOTOS_DB,
  platformListings:process.env.NOTION_PLATFORM_LISTINGS_DB,
  threads:         process.env.NOTION_THREADS_DB,
  messages:        process.env.NOTION_MESSAGES_DB,
  meetings:        process.env.NOTION_MEETINGS_DB,
  settings:        process.env.NOTION_SETTINGS_DB,
};

// ─── Property helpers ───────────────────────────────────────────────────────

const getText = (page, prop) =>
  page.properties[prop]?.rich_text?.[0]?.plain_text ?? '';

const getTitle = (page, prop) =>
  page.properties[prop]?.title?.[0]?.plain_text ?? '';

const getSelect = (page, prop) =>
  page.properties[prop]?.select?.name ?? '';

const getNumber = (page, prop) =>
  page.properties[prop]?.number ?? null;

const getDate = (page, prop) =>
  page.properties[prop]?.date?.start ?? null;

const getUrl = (page, prop) =>
  page.properties[prop]?.url ?? null;

const getCheckbox = (page, prop) =>
  page.properties[prop]?.checkbox ?? false;

const richText = (v) => ({
  rich_text: v != null && v !== ''
    ? [{ text: { content: String(v).slice(0, 2000) } }]
    : [],
});
const titleProp = (v) => ({
  title: v != null && v !== ''
    ? [{ text: { content: String(v).slice(0, 2000) } }]
    : [],
});
const numProp   = (v) => ({ number: (v === undefined || v === null || v === '') ? null : Number(v) });
const selectProp= (v) => v ? { select: { name: String(v) } } : { select: null };
const dateProp  = (v) => v ? { date: { start: v instanceof Date ? v.toISOString() : String(v) } } : { date: null };
const urlProp   = (v) => ({ url: v || null });
const checkboxProp = (v) => ({ checkbox: Boolean(v) });

// ─── Pagination helper ───────────────────────────────────────────────────────

async function queryAll(dbId, filter, sorts) {
  const pages = [];
  let cursor;
  do {
    const resp = await notion.databases.query({
      database_id: dbId,
      ...(filter && { filter }),
      ...(sorts  && { sorts }),
      ...(cursor && { start_cursor: cursor }),
      page_size: 100,
    });
    pages.push(...resp.results);
    cursor = resp.has_more ? resp.next_cursor : undefined;
  } while (cursor);
  return pages;
}

// ─── Listings ────────────────────────────────────────────────────────────────

function pageToListing(page) {
  return {
    id:                   page.id,
    title:                getTitle(page, 'Name'),
    description:          getText(page, 'Description'),
    price:                getNumber(page, 'Price'),
    category:             getText(page, 'Category'),
    condition:            getSelect(page, 'Condition'),
    status:               getSelect(page, 'Status'),
    min_acceptable_price: getNumber(page, 'MinAcceptablePrice'),
    created_at:           getDate(page, 'CreatedAt'),
  };
}

export async function createListing(data) {
  const page = await notion.pages.create({
    parent: { database_id: DB.listings },
    properties: {
      Name:                 titleProp(data.title ?? ''),
      Description:          richText(data.description ?? ''),
      Price:                numProp(data.price),
      Category:             richText(data.category ?? ''),
      Condition:            selectProp(data.condition ?? 'used'),
      Status:               selectProp('draft'),
      MinAcceptablePrice:   numProp(data.min_acceptable_price),
      CreatedAt:            dateProp(new Date().toISOString()),
    },
  });
  return { id: page.id };
}

export async function getListing(id) {
  const page = await notion.pages.retrieve({ page_id: id });
  return pageToListing(page);
}

export async function getAllListings() {
  const pages = await queryAll(DB.listings, undefined, [
    { property: 'CreatedAt', direction: 'descending' },
  ]);
  const listings = pages.map(pageToListing);

  // Attach platform statuses for each listing (parallel fetch)
  await Promise.all(
    listings.map(async (l) => {
      l.platforms = await getPlatformListings(l.id);
      // Attach first photo for thumbnail
      const photos = await getPhotos(l.id);
      l.photo = photos[0]?.enhanced_path ?? photos[0]?.original_path ?? null;
    })
  );
  return listings;
}

export async function updateListing(id, data) {
  const props = {};
  if (data.title       !== undefined) props.Name               = titleProp(data.title);
  if (data.description !== undefined) props.Description        = richText(data.description);
  if (data.price       !== undefined) props.Price              = numProp(data.price);
  if (data.category    !== undefined) props.Category           = richText(data.category);
  if (data.condition   !== undefined) props.Condition          = selectProp(data.condition);
  if (data.status      !== undefined) props.Status             = selectProp(data.status);
  if (data.min_acceptable_price !== undefined)
    props.MinAcceptablePrice = numProp(data.min_acceptable_price);

  await notion.pages.update({ page_id: id, properties: props });
}

export async function deleteListing(id) {
  await notion.pages.update({ page_id: id, archived: true });
}

// ─── Photos ──────────────────────────────────────────────────────────────────

function pageToPhoto(page) {
  return {
    id:            page.id,
    listing_id:    getText(page, 'ListingId'),
    original_path: getText(page, 'OriginalPath'),
    enhanced_path: getText(page, 'EnhancedPath') || null,
    display_order: getNumber(page, 'DisplayOrder') ?? 0,
  };
}

export async function addPhoto(listingId, originalPath, enhancedPath, order) {
  const page = await notion.pages.create({
    parent: { database_id: DB.photos },
    properties: {
      Name:          titleProp(`Photo ${order + 1}`),
      ListingId:     richText(listingId),
      OriginalPath:  richText(originalPath),
      EnhancedPath:  richText(enhancedPath ?? ''),
      DisplayOrder:  numProp(order),
    },
  });
  return { id: page.id };
}

export async function getPhotos(listingId) {
  const pages = await queryAll(DB.photos, {
    property: 'ListingId',
    rich_text: { equals: listingId },
  }, [{ property: 'DisplayOrder', direction: 'ascending' }]);
  return pages.map(pageToPhoto);
}

export async function deletePhoto(id) {
  await notion.pages.update({ page_id: id, archived: true });
}

// ─── Platform Listings ───────────────────────────────────────────────────────

function pageToPlatformListing(page) {
  return {
    id:          page.id,
    listing_id:  getText(page, 'ListingId'),
    platform:    getSelect(page, 'Platform'),
    external_id: getText(page, 'ExternalId'),
    status:      getSelect(page, 'Status'),
    url:         getUrl(page, 'Url'),
    error:       getText(page, 'Error'),
    posted_at:   getDate(page, 'PostedAt'),
  };
}

export async function getPlatformListings(listingId) {
  const pages = await queryAll(DB.platformListings, {
    property: 'ListingId',
    rich_text: { equals: listingId },
  });
  return pages.map(pageToPlatformListing);
}

export async function upsertPlatformListing(listingId, platform, data = {}) {
  // Check if already exists
  const pages = await queryAll(DB.platformListings, {
    and: [
      { property: 'ListingId', rich_text: { equals: listingId } },
      { property: 'Platform',  select:    { equals: platform } },
    ],
  });

  const props = {
    Name:       titleProp(platform),
    ListingId:  richText(listingId),
    Platform:   selectProp(platform),
    Status:     selectProp(data.status ?? 'pending'),
    ...(data.external_id && { ExternalId: richText(data.external_id) }),
    ...(data.url         && { Url:        urlProp(data.url) }),
    ...(data.error       && { Error:      richText(data.error) }),
    ...(data.posted_at   && { PostedAt:   dateProp(data.posted_at) }),
  };

  if (pages.length > 0) {
    await notion.pages.update({ page_id: pages[0].id, properties: props });
    return pages[0].id;
  } else {
    const page = await notion.pages.create({
      parent: { database_id: DB.platformListings },
      properties: props,
    });
    return page.id;
  }
}

// ─── Message Threads ─────────────────────────────────────────────────────────

function pageToThread(page) {
  return {
    id:             page.id,
    listing_id:     getText(page, 'ListingId') || null,
    platform:       getSelect(page, 'Platform'),
    thread_id:      getText(page, 'ThreadId'),
    buyer_name:     getTitle(page, 'Name'),
    buyer_contact:  getText(page, 'BuyerContact'),
    status:         getSelect(page, 'Status'),
    created_at:     getDate(page, 'CreatedAt'),
  };
}

export async function createThread(data) {
  const page = await notion.pages.create({
    parent: { database_id: DB.threads },
    properties: {
      Name:          titleProp(data.buyer_name ?? 'Unknown Buyer'),
      ListingId:     richText(data.listing_id ?? ''),
      Platform:      selectProp(data.platform),
      ThreadId:      richText(data.thread_id),
      BuyerContact:  richText(data.buyer_contact ?? ''),
      Status:        selectProp('active'),
      CreatedAt:     dateProp(new Date().toISOString()),
    },
  });
  return pageToThread(await notion.pages.retrieve({ page_id: page.id }));
}

export async function getThreadByPlatformId(platform, threadId) {
  const pages = await queryAll(DB.threads, {
    and: [
      { property: 'Platform', select:    { equals: platform } },
      { property: 'ThreadId', rich_text: { equals: threadId } },
    ],
  });
  return pages.length > 0 ? pageToThread(pages[0]) : null;
}

export async function getThread(id) {
  const page = await notion.pages.retrieve({ page_id: id });
  return pageToThread(page);
}

export async function updateThread(id, data) {
  const props = {};
  if (data.status !== undefined) props.Status = selectProp(data.status);
  await notion.pages.update({ page_id: id, properties: props });
}

export async function getAllThreads() {
  const pages = await queryAll(DB.threads, undefined, [
    { property: 'CreatedAt', direction: 'descending' },
  ]);
  const threads = pages.map(pageToThread);

  // Enrich with listing title/price, message count, last message, meeting info
  await Promise.all(threads.map(async (t) => {
    if (t.listing_id) {
      try {
        const listing = await getListing(t.listing_id);
        t.listing_title = listing.title;
        t.listing_price = listing.price;
      } catch { t.listing_title = null; t.listing_price = null; }
    }

    const msgs = await getMessages(t.id);
    t.message_count = msgs.length;
    t.last_message = msgs.at(-1)?.body ?? null;

    const meeting = await getConfirmedMeeting(t.id);
    t.confirmed_time = meeting?.confirmed_time ?? null;
    t.meeting_status = meeting?.status ?? null;
  }));

  return threads;
}

// ─── Messages ────────────────────────────────────────────────────────────────

function pageToMessage(page) {
  return {
    id:            page.id,
    thread_id:     getText(page, 'ThreadId'),
    direction:     getSelect(page, 'Direction'),
    body:          getText(page, 'Body'),
    sent_at:       getDate(page, 'SentAt'),
    ai_generated:  getCheckbox(page, 'AiGenerated') ? 1 : 0,
  };
}

export async function createMessage(threadId, direction, body, aiGenerated = true) {
  const page = await notion.pages.create({
    parent: { database_id: DB.messages },
    properties: {
      Name:         titleProp(`${direction} ${new Date().toISOString()}`),
      ThreadId:     richText(threadId),
      Direction:    selectProp(direction),
      Body:         richText(body),
      SentAt:       dateProp(new Date().toISOString()),
      AiGenerated:  checkboxProp(aiGenerated),
    },
  });
  return { id: page.id };
}

export async function getMessages(threadId) {
  const pages = await queryAll(DB.messages, {
    property: 'ThreadId',
    rich_text: { equals: threadId },
  }, [{ property: 'SentAt', direction: 'ascending' }]);
  return pages.map(pageToMessage);
}

export async function messageExists(threadId, body) {
  // Check if an inbound message with this exact body already exists for this thread
  const msgs = await getMessages(threadId);
  return msgs.some((m) => m.direction === 'inbound' && m.body === body);
}

// ─── Scheduled Meetings ──────────────────────────────────────────────────────

function pageToMeeting(page) {
  return {
    id:                page.id,
    thread_id:         getText(page, 'ThreadId'),
    confirmed_time:    getDate(page, 'ConfirmedTime'),
    calendar_event_id: getText(page, 'CalendarEventId') || null,
    status:            getSelect(page, 'Status'),
    notified_user:     getCheckbox(page, 'NotifiedUser') ? 1 : 0,
  };
}

export async function createMeeting(threadId, confirmedTime) {
  const page = await notion.pages.create({
    parent: { database_id: DB.meetings },
    properties: {
      Name:          titleProp('Meeting'),
      ThreadId:      richText(threadId),
      ConfirmedTime: dateProp(confirmedTime),
      Status:        selectProp('pending'),
      NotifiedUser:  checkboxProp(false),
    },
  });
  return pageToMeeting(await notion.pages.retrieve({ page_id: page.id }));
}

export async function updateMeeting(id, data) {
  const props = {};
  if (data.status            !== undefined) props.Status           = selectProp(data.status);
  if (data.calendar_event_id !== undefined) props.CalendarEventId  = richText(data.calendar_event_id ?? '');
  if (data.notified_user     !== undefined) props.NotifiedUser     = checkboxProp(data.notified_user);
  if (data.confirmed_time    !== undefined) props.ConfirmedTime    = dateProp(data.confirmed_time);
  await notion.pages.update({ page_id: id, properties: props });
}

export async function getPendingMeeting(threadId) {
  const pages = await queryAll(DB.meetings, {
    and: [
      { property: 'ThreadId', rich_text: { equals: threadId } },
      { property: 'Status',   select:    { equals: 'pending' } },
    ],
  });
  return pages.length > 0 ? pageToMeeting(pages[0]) : null;
}

export async function getConfirmedMeeting(threadId) {
  const pages = await queryAll(DB.meetings, {
    and: [
      { property: 'ThreadId', rich_text: { equals: threadId } },
      { property: 'Status',   select:    { equals: 'confirmed' } },
    ],
  });
  return pages.length > 0 ? pageToMeeting(pages[0]) : null;
}

export async function getUnnotifiedMeetings() {
  const pages = await queryAll(DB.meetings, {
    and: [
      { property: 'NotifiedUser', checkbox: { equals: false } },
      { property: 'Status',       select:   { equals: 'confirmed' } },
    ],
  });
  const meetings = pages.map(pageToMeeting);

  // Enrich with thread + listing info
  await Promise.all(meetings.map(async (m) => {
    try {
      const thread = await getThread(m.thread_id);
      m.buyer_name = thread.buyer_name;
      m.platform   = thread.platform;
      if (thread.listing_id) {
        const listing = await getListing(thread.listing_id);
        m.title = listing.title;
        m.price = listing.price;
      }
    } catch { /* non-critical */ }
  }));
  return meetings;
}

export async function getPendingMeetingsForDashboard() {
  const meetings = await getUnnotifiedMeetings();
  return meetings;
}

// ─── Settings ────────────────────────────────────────────────────────────────

export async function getSetting(key) {
  const pages = await queryAll(DB.settings, {
    property: 'Key',
    title: { equals: key },
  });
  return pages.length > 0 ? getText(pages[0], 'Value') : null;
}

export async function getAllSettings() {
  const pages = await queryAll(DB.settings);
  const result = {};
  for (const page of pages) {
    const key = getTitle(page, 'Key');
    const val = getText(page, 'Value');
    if (key) {
      try { result[key] = JSON.parse(val); }
      catch { result[key] = val; }
    }
  }
  return result;
}

export async function setSetting(key, value) {
  const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const pages = await queryAll(DB.settings, {
    property: 'Key', title: { equals: key },
  });

  if (pages.length > 0) {
    await notion.pages.update({
      page_id: pages[0].id,
      properties: { Value: richText(strVal) },
    });
  } else {
    await notion.pages.create({
      parent: { database_id: DB.settings },
      properties: {
        Key:   titleProp(key),
        Value: richText(strVal),
      },
    });
  }
}

export async function initDefaultSettings() {
  const defaults = {
    meetup_location: '',
    available_windows: JSON.stringify([
      { days: [1, 2, 3, 4, 5], after: '18:00', before: '22:00' },
      { days: [0, 6], after: '08:00', before: '20:00' },
    ]),
    craigslist_city: 'sfbay',
    notify_email: '',
  };
  for (const [key, value] of Object.entries(defaults)) {
    const existing = await getSetting(key);
    if (existing === null) await setSetting(key, value);
  }
}

// ─── Active listings (for poller subject matching) ───────────────────────────

export async function getActiveListings() {
  const pages = await queryAll(DB.listings, {
    property: 'Status',
    select: { does_not_equal: 'draft' },
  });
  return pages.map(pageToListing);
}

// ─── Platform listing lookup by external ID ───────────────────────────────────

export async function getPlatformListingByExternalId(platform, externalId) {
  const pages = await queryAll(DB.platformListings, {
    and: [
      { property: 'Platform',   select:    { equals: platform } },
      { property: 'ExternalId', rich_text: { equals: externalId } },
    ],
  });
  return pages.length > 0 ? pageToPlatformListing(pages[0]) : null;
}
