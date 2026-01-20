
// PK's Reader — front-end logic
const state = {
  feeds: [],            // [{url, title, folder}]
  items: [],            // normalized items from data/items.json
  filter: { type: 'all', value: null }, // 'all' | 'starred' | 'feed' | 'folder'
  search: '',
  selectedId: null,
  read: new Set(JSON.parse(localStorage.getItem('pksReaderRead') || '[]')),
  starred: new Set(JSON.parse(localStorage.getItem('pksReaderStar') || '[]')),
};

const els = {
  feedList: document.getElementById('feed-list'),
  itemList: document.getElementById('item-list'),
  reader: document.getElementById('reader'),
  search: document.getElementById('search'),
  status: document.getElementById('status-text'),
  markAll: document.getElementById('mark-all-read'),
  toggleTheme: document.getElementById('toggle-theme'),
  opmlInput: document.getElementById('opml-input'),
  exportOpml: document.getElementById('export-opml'),
};

const saveSets = () => {
  localStorage.setItem('pksReaderRead', JSON.stringify([...state.read]));
  localStorage.setItem('pksReaderStar', JSON.stringify([...state.starred]));
  render(); // update counts + list styling
};

function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return sameDay ? d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) :
    d.toLocaleDateString();
}

function normalize(str, max=240) {
  if (!str) return '';
  const s = str.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max-1) + '…' : s;
}

async function loadData() {
  try {
    const [feedsRes, itemsRes] = await Promise.all([
      fetch('feeds.json', { cache: 'no-store' }),
      fetch(`data/items.json?bust=${Date.now()}`)
    ]);
    state.feeds = feedsRes.ok ? await feedsRes.json() : {feeds:[]};
    const itemsJson = itemsRes.ok ? await itemsRes.json() : { items: [], updatedAt: null };
    state.items = itemsJson.items || [];
    els.status.textContent = itemsJson.updatedAt ? `Updated ${new Date(itemsJson.updatedAt).toLocaleString()}` : 'No data yet';
  } catch (e) {
    console.error(e);
    els.status.textContent = 'Failed to load data';
  }
}

function countsByFeed() {
  const counts = {};
  for (const it of state.items) {
    if (!state.read.has(it.id)) {
      counts[it.feedUrl] = (counts[it.feedUrl] || 0) + 1;
    }
  }
  return counts;
}

function renderSidebar() {
  const counts = countsByFeed();
  const byFolder = {};
  for (const f of state.feeds.feeds || []) {
    const folder = f.folder || 'Unfiled';
    (byFolder[folder] ||= []).push(f);
  }
  const totalUnread = Object.values(counts).reduce((a,b)=>a+b,0);
  const starredCount = state.starred.size;

  const parts = [];
  parts.push(buttonFeed('All', 'all', null, totalUnread, state.filter.type==='all'));
  parts.push(buttonFeed('Starred', 'starred', null, starredCount, state.filter.type==='starred'));

  for (const folder of Object.keys(byFolder).sort()) {
    parts.push(`<div class="section-title">${folder}</div>`);
    for (const f of byFolder[folder].sort((a,b)=>a.title.localeCompare(b.title))) {
      const active = state.filter.type==='feed' && state.filter.value===f.url;
      parts.push(buttonFeed(f.title, 'feed', f.url, counts[f.url] || 0, active));
    }
  }
  els.feedList.innerHTML = parts.join('\n');

  function buttonFeed(name, type, value, count, active=false) {
    return `<div class="feed-item ${active?'active':''}" data-type="${type}" data-value="${value||''}">
      <div class="feed-name">${escapeHtml(name)}</div>
      <div class="feed-count">${count>0 ? `<span class="badge">${count}</span>` : ''}</div>
    </div>`;
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function visibleItems() {
  let arr = state.items;
  if (state.filter.type === 'starred') {
    arr = arr.filter(it => state.starred.has(it.id));
  } else if (state.filter.type === 'feed') {
    arr = arr.filter(it => it.feedUrl === state.filter.value);
  } else if (state.filter.type === 'folder') {
    const urls = new Set((state.feeds.feeds||[]).filter(f=>f.folder===state.filter.value).map(f=>f.url));
    arr = arr.filter(it => urls.has(it.feedUrl));
  }
  if (state.search) {
    const q = state.search.toLowerCase();
    arr = arr.filter(it =>
      (it.title||'').toLowerCase().includes(q) ||
      (it.snippet||'').toLowerCase().includes(q) ||
      (it.feedTitle||'').toLowerCase().includes(q)
    );
  }
  return arr;
}

function renderList() {
  const items = visibleItems();
  const html = items.map(it => {
    const unread = !state.read.has(it.id);
    return `<div class="item ${unread?'unread':''}" data-id="${it.id}">
      <div class="title">${escapeHtml(it.title || '(no title)')}</div>
      <div class="snippet">${escapeHtml(it.snippet || '')}</div>
      <div class="meta">
        <span>${escapeHtml(it.feedTitle||'')}</span>
        <span>•</span>
        <span>${fmtDate(it.isoDate)}</span>
        ${state.starred.has(it.id) ? '<span class="badge">★</span>' : ''}
      </div>
    </div>`;
  }).join('\n');
  els.itemList.innerHTML = html || `<div class="item"><div class="snippet">No items match.</div></div>`;
}

function renderReader() {
  const it = state.items.find(x => x.id === state.selectedId);
  if (!it) {
    els.reader.innerHTML = `<div class="empty">Select an article</div>`;
    return;
  }
  const star = state.starred.has(it.id);
  els.reader.innerHTML = `
    <div class="meta">${escapeHtml(it.feedTitle||'')} • ${fmtDate(it.isoDate)}</div>
    <h1>${escapeHtml(it.title||'(no title)')}</h1>
    <div class="reader-actions" style="display:flex; gap:8px; margin:8px 0 16px;">
      <a class="btn" href="${it.link}" target="_blank" rel="noopenerlass="btn">${state.read.has(it.id)?'Mark unread':'Mark read'} (m)</button>
      <button id="toggle-star" class="btn">${star?'Unstar':'Star'} (s)</button>
    </div>
    <div class="content">${it.content || `<p>${escapeHtml(it.snippet||'')}</p>`}</div>
  `;
  document.getElementById('toggle-read').onclick = () => { toggleRead(it.id); };
  document.getElementById('toggle-star').onclick = () => { toggleStar(it.id); };
}

function render() {
  renderSidebar();
  renderList();
  renderReader();
}

function setFilter(type, value=null) {
  state.filter = { type, value };
  state.selectedId = null;
  render();
}

function toggleRead(id) {
  if (state.read.has(id)) state.read.delete(id);
  else state.read.add(id);
  saveSets();
}

function toggleStar(id) {
  if (state.starred.has(id)) state.starred.delete(id);
  else state.starred.add(id);
  saveSets();
}

function selectNext(delta) {
  const items = visibleItems();
  if (items.length === 0) return;
  let idx = items.findIndex(x => x.id === state.selectedId);
  if (idx === -1) idx = 0;
  else idx = Math.min(Math.max(0, idx + delta), items.length - 1);
  state.selectedId = items[idx].id;
  // mark read on open
  state.read.add(state.selectedId);
  saveSets();
}

function markAllVisibleRead() {
  for (const it of visibleItems()) state.read.add(it.id);
  saveSets();
}

function initEvents() {
  els.feedList.addEventListener('click', (e) => {
    const item = e.target.closest('.feed-item');
    if (!item) return;
    const type = item.dataset.type;
    const value = item.dataset.value || null;
    setFilter(type, value);
  });
  els.itemList.addEventListener('click', (e) => {
    const row = e.target.closest('.item');
    if (!row) return;
    const id = row.dataset.id;
    state.selectedId = id;
    state.read.add(id);
    saveSets();
  });
  els.search.addEventListener('input', (e) => {
    state.search = e.target.value.trim();
    render();
  });
  els.markAll.addEventListener('click', () => markAllVisibleRead());
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'j') selectNext(+1);
    if (e.key === 'k') selectNext(-1);
    if (e.key === 'm') { if (state.selectedId) toggleRead(state.selectedId); }
    if (e.key === 's') { if (state.selectedId) toggleStar(state.selectedId); }
    if (e.key === 'A' && e.shiftKey) markAllVisibleRead();
  });
  els.toggleTheme.addEventListener('click', () => {
    const current = document.documentElement.dataset.theme;
    const next = current === 'dark' ? '' : 'dark';
    if (next) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    localStorage.setItem('pksReaderTheme', next);
  });

  // OPML import: show parsed feeds JSON to paste (or commit subscriptions.opml to repo)
  els.opmlInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(text, 'text/xml');
    const outlines = [...xml.querySelectorAll('outline[xmlUrl]')];
    const feeds = outlines.map(o => ({
      title: o.getAttribute('title') || o.getAttribute('text') || o.getAttribute('xmlUrl'),
      url: o.getAttribute('xmlUrl'),
      folder: o.parentElement?.getAttribute('title') || ''
    }));
    alert(`Parsed ${feeds.length} feeds from OPML.\n\nTo make them live:\n1) Upload this file as subscriptions.opml to your repo, OR\n2) Edit feeds.json in GitHub and paste feeds.\n\nConsole has JSON for copy/paste.`);
    console.log('OPML feeds:', feeds);
  });

  // OPML export (client-side) from current feeds.json
  els.exportOpml.addEventListener('click', () => {
    const feeds = state.feeds.feeds || [];
    const body = feeds.map(f => `      <outline text="${escapeXml(f.title||'')}" title="${escapeXml(f.title||'')}" type="rss" xmlUrl="${escapeXml(f.url)}" />`).join('\n');
    const opml = `<?xml version="1.0" encoding="UTF-8"?>
<opml version="2.0">
  <head><title>PK's Reader Subscriptions</title></head>
  <body>
${body}
  </body>
</opml>`;
    const blob = new Blob([opml], {type:'text/xml'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'subscriptions.opml';
    a.click();
    URL.revokeObjectURL(a.href);
  });
}

function escapeXml(s){return String(s).replace(/[<>&'"]/g, c=>({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));}

(async function start() {
  initEvents();
  // Theme restore
  const theme = localStorage.getItem('pksReaderTheme');
  if (theme) document.documentElement.dataset.theme = theme;
  await loadData();
  render();
})();
