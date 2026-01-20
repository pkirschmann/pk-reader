
// Converts subscriptions.opml -> feeds.json if the OPML exists.
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { XMLParser } from 'fast-xml-parser';

const OPML = 'subscriptions.opml';
const OUT = 'feeds.json';

if (!existsSync(OPML)) {
  console.log('No subscriptions.opml found; skipping OPML conversion.');
  process.exit(0);
}

const xml = readFileSync(OPML, 'utf8');
const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });
const obj = parser.parse(xml);

function flattenOutlines(node, folder='') {
  if (!node) return [];
  const arr = [];
  const outlines = Array.isArray(node) ? node : [node];
  for (const out of outlines) {
    if (!out) continue;
    if (out.xmlUrl) {
      arr.push({
        title: out.title || out.text || out.xmlUrl,
        url: out.xmlUrl,
        folder
      });
    }
    if (out.outline) {
      const subFolder = out.title || out.text || folder;
      arr.push(...flattenOutlines(out.outline, subFolder));
    }
  }
  return arr;
}

const body = obj?.opml?.body;
const outlines = body?.outline;
const feeds = flattenOutlines(outlines);

const json = { feeds };
writeFileSync(OUT, JSON.stringify(json, null, 2));
console.log(`Converted ${feeds.length} feeds from ${OPML} to ${OUT}`);
``
