
// Fetches feeds listed in feeds.json and writes data/items.json
import Parser from 'rss-parser';
import { readFileSync, writeFileSync } from 'fs';

const parser = new Parser({
  timeout: 20000, // 20s
  headers: { 'User-Agent': 'PKsReader (+https://github.com/your-username/pks-reader)' }
});

const feedsCfg = JSON.parse(readFileSync('feeds.json', 'utf8'));
const feeds = feedsCfg.feeds || [];

function makeId(feedUrl, item) {
  const base = item.guid || item.id || item.link || `${item.title||''}`;
  return `${feedUrl}|${base}`.slice(0, 900); // ensure manageable key
}

function toSnippet(item) {
  const source = item.contentSnippet || item.content || item['content:encoded'] || '';
  return String(source).replace(/<[^>]*>/g, ' ').replace(/\s+/g,' ').trim().slice(0, 400);
}

async function fetchOne(feed) {
  try {
    const res = await parser.parseURL(feed.url);
    const feedTitle = feed.title || res.title || feed.url;
    return res.items.map(it => ({
      id: makeId(feed.url, it),
      feedUrl: feed.url,
      feedTitle,
      title: it.title || '(no title)',
      link: it.link || '',
      isoDate: it.isoDate || it.pubDate || null,
      snippet: toSnippet(it),
      content: it['content:encoded'] || it.content || null
    }));
  } catch (e) {
    console.error('Failed:', feed.url, e.message);
    return [];
  }
}

async function main() {
  const batches = await Promise.all(feeds.map(fetchOne));
  let items = batches.flat();
  // sort by date desc with fallback
  items.sort((a,b) => {
    const da = a.isoDate ? new Date(a.isoDate).getTime() : 0;
    const db = b.isoDate ? new Date(b.isoDate).getTime() : 0;
    return db - da;
  });
  // keep last N
  const MAX = 1500;
  if (items.length > MAX) items = items.slice(0, MAX);

  const out = {
    updatedAt: new Date().toISOString(),
    items
  };
  writeFileSync('data/items.json', JSON.stringify(out, null, 2));
  console.log(`Wrote data/items.json with ${items.length} items across ${feeds.length} feeds.`);
}

main().catch(e => { console.error(e); process.exit(1); });
