/**
 * Run once to create all required Notion databases under a parent page.
 *
 * Usage:
 *   1. Create a blank Notion page — this will be the parent for all databases.
 *   2. Share that page with your Notion integration (give it "Full access").
 *   3. Copy the page ID from the URL: notion.so/Page-Title-<PAGE_ID>
 *   4. Set NOTION_TOKEN and NOTION_PARENT_PAGE_ID in your .env
 *   5. Run:  node server/setupNotion.js
 *   6. Copy the printed DB IDs into your .env file.
 */
import 'dotenv/config';
import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const parentPageId = process.env.NOTION_PARENT_PAGE_ID;

if (!process.env.NOTION_TOKEN || !parentPageId) {
  console.error('Error: NOTION_TOKEN and NOTION_PARENT_PAGE_ID must be set in .env');
  process.exit(1);
}

async function createDatabase(title, properties) {
  const db = await notion.databases.create({
    parent: { type: 'page_id', page_id: parentPageId },
    title: [{ type: 'text', text: { content: title } }],
    properties,
  });
  console.log(`✅ ${title}: ${db.id}`);
  return db.id;
}

async function main() {
  console.log('\nCreating Notion databases...\n');

  const listingsId = await createDatabase('Listings', {
    Name:                { title: {} },
    Description:         { rich_text: {} },
    Price:               { number: { format: 'dollar' } },
    Category:            { rich_text: {} },
    Condition:           { select: { options: [
      { name: 'new',      color: 'green' },
      { name: 'like_new', color: 'blue' },
      { name: 'good',     color: 'yellow' },
      { name: 'fair',     color: 'orange' },
      { name: 'poor',     color: 'red' },
      { name: 'used',     color: 'gray' },
    ]}},
    Status:              { select: { options: [
      { name: 'draft',  color: 'gray' },
      { name: 'active', color: 'green' },
      { name: 'sold',   color: 'blue' },
    ]}},
    MinAcceptablePrice:  { number: { format: 'dollar' } },
    CreatedAt:           { date: {} },
  });

  const photosId = await createDatabase('ListingPhotos', {
    Name:          { title: {} },
    ListingId:     { rich_text: {} },
    OriginalPath:  { rich_text: {} },
    EnhancedPath:  { rich_text: {} },
    DisplayOrder:  { number: {} },
  });

  const platformListingsId = await createDatabase('PlatformListings', {
    Name:       { title: {} },
    ListingId:  { rich_text: {} },
    Platform:   { select: { options: [
      { name: 'ebay',       color: 'yellow' },
      { name: 'craigslist', color: 'purple' },
      { name: 'facebook',   color: 'blue' },
    ]}},
    ExternalId: { rich_text: {} },
    Status:     { select: { options: [
      { name: 'pending', color: 'yellow' },
      { name: 'live',    color: 'green' },
      { name: 'error',   color: 'red' },
    ]}},
    Url:        { url: {} },
    Error:      { rich_text: {} },
    PostedAt:   { date: {} },
  });

  const threadsId = await createDatabase('MessageThreads', {
    Name:         { title: {} },
    ListingId:    { rich_text: {} },
    Platform:     { select: { options: [
      { name: 'ebay',       color: 'yellow' },
      { name: 'craigslist', color: 'purple' },
      { name: 'facebook',   color: 'blue' },
    ]}},
    ThreadId:     { rich_text: {} },
    BuyerContact: { rich_text: {} },
    Status:       { select: { options: [
      { name: 'active',            color: 'green' },
      { name: 'meeting_scheduled', color: 'orange' },
      { name: 'archived',          color: 'gray' },
    ]}},
    CreatedAt:    { date: {} },
  });

  const messagesId = await createDatabase('Messages', {
    Name:        { title: {} },
    ThreadId:    { rich_text: {} },
    Direction:   { select: { options: [
      { name: 'inbound',  color: 'blue' },
      { name: 'outbound', color: 'green' },
    ]}},
    Body:        { rich_text: {} },
    SentAt:      { date: {} },
    AiGenerated: { checkbox: {} },
  });

  const meetingsId = await createDatabase('ScheduledMeetings', {
    Name:             { title: {} },
    ThreadId:         { rich_text: {} },
    ConfirmedTime:    { date: {} },
    CalendarEventId:  { rich_text: {} },
    Status:           { select: { options: [
      { name: 'pending',   color: 'yellow' },
      { name: 'confirmed', color: 'green' },
      { name: 'cancelled', color: 'red' },
    ]}},
    NotifiedUser:     { checkbox: {} },
  });

  const settingsId = await createDatabase('Settings', {
    Key:   { title: {} },
    Value: { rich_text: {} },
  });

  console.log('\n───────────────────────────────────────────────────');
  console.log('Add these to your .env file:\n');
  console.log(`NOTION_LISTINGS_DB=${listingsId}`);
  console.log(`NOTION_PHOTOS_DB=${photosId}`);
  console.log(`NOTION_PLATFORM_LISTINGS_DB=${platformListingsId}`);
  console.log(`NOTION_THREADS_DB=${threadsId}`);
  console.log(`NOTION_MESSAGES_DB=${messagesId}`);
  console.log(`NOTION_MEETINGS_DB=${meetingsId}`);
  console.log(`NOTION_SETTINGS_DB=${settingsId}`);
  console.log('───────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
