#!/usr/bin/env node
/**
 * Film metadata admin — run with: node scripts/admin.cjs
 * Opens on http://localhost:3001
 */
const http = require('http');
const fs   = require('fs');
const path = require('path');

const FILMS_PATH  = path.resolve(__dirname, '../src/lib/films.ts');
const STILLS_PATH = path.resolve(__dirname, '../src/lib/stills.ts');
const PORT = 3001;

const AUTH_USER = 'pierrekattar';
const AUTH_PASS = 'pkiS0kAdmin!';
const AUTH_TOKEN = 'Basic ' + Buffer.from(`${AUTH_USER}:${AUTH_PASS}`).toString('base64');

function requireAuth(req, res) {
  if (req.headers['authorization'] === AUTH_TOKEN) return true;
  res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Admin"', 'Content-Type': 'text/plain' });
  res.end('Unauthorized');
  return false;
}

const ROLES       = ['Director', 'Director of Photography', 'Cinematographer', 'Editor', 'Producer', 'Writer', 'Narrator', 'Reporter', 'Video Journalist'];
const CLIENTS     = ['The New York Times', 'The Washington Post', 'The World Bank Group', 'National Public Radio', 'PBS', 'Newsweek', 'The Three Strikes Project', 'Culinary Backstreets', 'Orb Media', 'CollaborateUp!', 'I Am a Voter', 'Headcount', 'Center for American Progress', 'VJ Movement', 'Francesco Conte', 'Imitating Life Film', 'Her Aim is True Film', 'Abcam', 'Abdorrahman Boroumand Center for Human Rights in Iran', 'Roma Balkan Lab Orchestra', 'Red Orange Morning', 'Michael G. Smith', 'Seth Goldstein', 'Jill Drew', 'Whitman, Alabama', 'Self'];
const GENRES      = ['Documentary Short', 'Independent Documentary Short', 'Corporate Documentary Short', 'Documentary', 'Music Video', 'Narrative Short', 'Breaking News', 'News'];
const RECOGNITION = ['Emmy (local)', 'Emmy Nominated (national)'];

// ─── Parse films.ts ───────────────────────────────────────────────────────────

function parseFilms() {
  const lines = fs.readFileSync(FILMS_PATH, 'utf-8').split('\n');
  const films = [];
  let current = null;

  for (const line of lines) {
    if (line.includes('slug: "')) {
      if (current) films.push(current);
      current = { slug: '', title: '', category: '', role: '', client: '', genre: '', recognition: '', notes: '', thumbnail: '', trailerUrl: '' };
      current.slug = line.match(/slug:\s*"([^"]+)"/)[1];
      continue;
    }
    if (!current) continue;
    let m;
    if (!current.title     && (m = line.match(/^\s+title:\s*"([^"]+)"/)))                       current.title     = m[1];
    if (!current.category  && (m = line.match(/^\s+category:\s*"(journalism|documentary|fun)"/))) current.category = m[1];
    if (!current.thumbnail  && (m = line.match(/^\s+thumbnail:\s*"([^"]+)"/)))                   current.thumbnail  = m[1];
    if (!current.trailerUrl && (m = line.match(/^\s+trailerUrl:\s*"([^"]+)"/)))                  current.trailerUrl = m[1];
    if ((m = line.match(/^    role:\s*"([^"]+)"/)))        current.role        = m[1];
    if ((m = line.match(/^    client:\s*"([^"]+)"/)))      current.client      = m[1];
    if ((m = line.match(/^    genre:\s*"([^"]+)"/)))       current.genre       = m[1];
    if ((m = line.match(/^    recognition:\s*"([^"]+)"/))) current.recognition = m[1];
    if ((m = line.match(/^    notes:\s*"([^"]+)"/)))       current.notes       = m[1];
  }
  if (current) films.push(current);
  return films;
}

// ─── Write back to films.ts ───────────────────────────────────────────────────

function saveFilm(slug, role, client, genre, recognition, notes) {
  const lines = fs.readFileSync(FILMS_PATH, 'utf-8').split('\n');
  const slugIdx = lines.findIndex(l => l.includes(`slug: "${slug}"`));
  if (slugIdx === -1) return false;

  let creditsIdx = -1;
  for (let i = slugIdx + 1; i < Math.min(slugIdx + 25, lines.length); i++) {
    if (/^    credits:/.test(lines[i])) { creditsIdx = i; break; }
  }
  if (creditsIdx === -1) return false;

  const before = lines.slice(0, slugIdx + 1);
  const middle = lines.slice(slugIdx + 1, creditsIdx)
    .filter(l => !/^    role:\s*"/.test(l) && !/^    client:\s*"/.test(l) &&
                 !/^    genre:\s*"/.test(l) && !/^    recognition:\s*"/.test(l) &&
                 !/^    notes:\s*"/.test(l));
  const after  = lines.slice(creditsIdx);

  if (role)        middle.push(`    role: "${role}",`);
  if (client)      middle.push(`    client: "${client}",`);
  if (genre)       middle.push(`    genre: "${genre}",`);
  if (recognition) middle.push(`    recognition: "${recognition}",`);
  if (notes)       middle.push(`    notes: "${notes.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n')}",`);

  fs.writeFileSync(FILMS_PATH, [...before, ...middle, ...after].join('\n'));
  return true;
}

// ─── Parse stills.ts ─────────────────────────────────────────────────────────

function parseStills() {
  const text = fs.readFileSync(STILLS_PATH, 'utf-8');
  const stills = [];
  // Split on object boundaries
  const blocks = text.split(/\},?\s*\{/);
  for (const block of blocks) {
    const thumb = block.match(/thumbnail:\s*['"]([^'"]+)['"]/);
    if (!thumb) continue;
    const title = block.match(/title:\s*['"]([^'"]+)['"]/);
    const role  = block.match(/role:\s*['"]([^'"]+)['"]/);
    const client = block.match(/client:\s*['"]([^'"]+)['"]/);
    const notes = block.match(/notes:\s*['"]([^'"]*)['"]/);
    stills.push({
      thumbnail:  thumb[1],
      title:      title  ? title[1]  : '',
      role:       role   ? role[1]   : '',
      client:     client ? client[1] : '',
      notes:      notes  ? notes[1]  : '',
    });
  }
  return stills;
}

function saveStill(thumbnail, title, role, client, notes) {
  let text = fs.readFileSync(STILLS_PATH, 'utf-8');
  // Find the block containing this thumbnail
  const thumbEscaped = thumbnail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const blockRe = new RegExp(
    '(\\{[^{}]*thumbnail:\\s*[\'"]' + thumbEscaped + '[\'"][^{}]*\\})',
    's'
  );
  const match = text.match(blockRe);
  if (!match) return false;

  let block = match[1];
  // Remove existing title/role/client/notes lines
  block = block.replace(/\n\s*title:\s*['"][^'"]*['"],?/g, '');
  block = block.replace(/\n\s*role:\s*['"][^'"]*['"],?/g, '');
  block = block.replace(/\n\s*client:\s*['"][^'"]*['"],?/g, '');
  block = block.replace(/\n\s*notes:\s*['"][^'"]*['"],?/g, '');

  // Insert before the closing brace
  const insertLines = [];
  if (title)  insertLines.push(`  title: '${title.replace(/'/g, "\\'")}',`);
  if (role)   insertLines.push(`  role: '${role.replace(/'/g, "\\'")}',`);
  if (client) insertLines.push(`  client: '${client.replace(/'/g, "\\'")}',`);
  if (notes)  insertLines.push(`  notes: '${notes.replace(/'/g, "\\'").replace(/\r?\n/g, '\\n')}',`);

  if (insertLines.length) {
    block = block.replace(/(\s*\})$/, '\n  ' + insertLines.join('\n  ') + '\n}');
  }

  text = text.replace(match[1], block);
  fs.writeFileSync(STILLS_PATH, text);
  return true;
}

// ─── HTML ─────────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderPage() {
  const films  = parseFilms();
  const stills = parseStills();

  const roleOptions        = ROLES.map(r => `<label><input type="checkbox" value="${esc(r)}">${esc(r)}</label>`).join('');
  const clientOptions      = ['', ...CLIENTS, '__add__'].map(c => {
    if (c === '')       return `<option value="">— none —</option>`;
    if (c === '__add__') return `<option value="__add__">+ Add new…</option>`;
    return `<option value="${esc(c)}">${esc(c)}</option>`;
  }).join('');
  const genreOptions       = ['', ...GENRES, '__add__'].map(g => {
    if (g === '')       return `<option value="">— none —</option>`;
    if (g === '__add__') return `<option value="__add__">+ Add new…</option>`;
    return `<option value="${esc(g)}">${esc(g)}</option>`;
  }).join('');
  const recognitionCheckboxes = RECOGNITION.map(r =>
    `<label><input type="checkbox" class="rec-cb" value="${esc(r)}">${esc(r)}</label>`
  ).join('') + `<button class="ms-add-btn" type="button">+ Add new…</button>`;

  const sections = ['journalism', 'documentary', 'fun'].map(cat => {
    const rows = films.filter(f => f.category === cat).map(f => `
      <tr data-slug="${esc(f.slug)}" data-role="${esc(f.role)}" data-client="${esc(f.client)}" data-genre="${esc(f.genre)}" data-recognition="${esc(f.recognition)}" data-notes="${esc(f.notes)}">
        <td class="title">${esc(f.title)}</td>
        <td class="thumb">${f.thumbnail ? `<button class="thumb-btn" data-trailer="${esc(f.trailerUrl)}"><img src="${esc(f.thumbnail)}" alt="" loading="lazy"><div class="thumb-play">▶</div></button>` : ''}</td>
        <td>
          <div class="ms" tabindex="0">
            <div class="ms-face"><span class="ms-label">Select…</span><span class="ms-arrow">▾</span></div>
            <div class="ms-drop">${roleOptions}</div>
          </div>
        </td>
        <td>
          <select class="client-select">${clientOptions}</select>
        </td>
        <td>
          <select class="genre-select">${genreOptions}</select>
        </td>
        <td>
          <div class="ms recognition-ms" tabindex="0">
            <div class="ms-face"><span class="ms-label">Select…</span><span class="ms-arrow">▾</span></div>
            <div class="ms-drop">${recognitionCheckboxes}</div>
          </div>
        </td>
        <td>
          <textarea class="notes-input" rows="2" placeholder="Notes…">${esc(f.notes)}</textarea>
        </td>
        <td class="status"></td>
      </tr>`).join('');

    return `
      <h2>${cat.charAt(0).toUpperCase() + cat.slice(1)}</h2>
      <table>
        <thead><tr>
          <th class="sortable col-title" data-col="0">Title <span class="sort-arrow"></span></th>
          <th class="col-thumb"></th>
          <th class="sortable col-role" data-col="2">Role <span class="sort-arrow"></span></th>
          <th class="sortable col-client" data-col="3">Client <span class="sort-arrow"></span></th>
          <th class="sortable col-genre" data-col="4">Genre <span class="sort-arrow"></span></th>
          <th class="sortable col-rec" data-col="5">Recognition <span class="sort-arrow"></span></th>
          <th class="col-notes">Notes</th>
          <th class="col-status"></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }).join('');

  const stillsSection = `
    <h2>Interview Stills</h2>
    <table>
      <thead><tr>
        <th class="col-title">Title</th>
        <th class="col-thumb"></th>
        <th class="col-role">Role</th>
        <th class="col-client">Client</th>
        <th class="col-notes">Notes</th>
        <th class="col-status"></th>
      </tr></thead>
      <tbody>
        ${stills.map(s => `
          <tr data-still-thumb="${esc(s.thumbnail)}" data-role="${esc(s.role)}" data-client="${esc(s.client)}" data-notes="${esc(s.notes)}">
            <td class="title"><input class="title-input" type="text" value="${esc(s.title)}" style="width:100%;background:#181818;border:1px solid #2e2e2e;border-radius:4px;color:#e5e5e5;font-size:.85rem;padding:6px 10px;outline:none;font-family:inherit;" /></td>
            <td class="thumb">
              <button class="thumb-btn still-thumb-btn" data-img="${esc(s.thumbnail)}">
                <img src="${esc(s.thumbnail)}" alt="" loading="lazy">
                <div class="thumb-play">⤢</div>
              </button>
            </td>
            <td>
              <div class="ms" tabindex="0">
                <div class="ms-face"><span class="ms-label">Select…</span><span class="ms-arrow">▾</span></div>
                <div class="ms-drop">${ROLES.map(r => `<label><input type="checkbox" value="${esc(r)}">${esc(r)}</label>`).join('')}</div>
              </div>
            </td>
            <td>
              <select class="client-select">${['', ...CLIENTS, '__add__'].map(c => {
                if (c === '')        return `<option value="">— none —</option>`;
                if (c === '__add__') return `<option value="__add__">+ Add new…</option>`;
                return `<option value="${esc(c)}">${esc(c)}</option>`;
              }).join('')}</select>
            </td>
            <td>
              <textarea class="notes-input" rows="2" placeholder="Notes…">${esc(s.notes)}</textarea>
            </td>
            <td class="status"></td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Film Admin</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
         background:#0f0f0f;color:#e5e5e5;padding:32px 24px}
    h1{font-size:1.4rem;font-weight:600;margin-bottom:32px;color:#fff}
    h2{font-size:.7rem;letter-spacing:.25em;text-transform:uppercase;
       color:#666;margin:44px 0 12px}
    table{width:100%;border-collapse:collapse;}
    th{text-align:left;font-size:.68rem;letter-spacing:.15em;text-transform:uppercase;
       color:#555;padding:6px 12px 6px 0;border-bottom:1px solid #1e1e1e}
    th.sortable{cursor:pointer;user-select:none;white-space:nowrap}
    th.sortable:hover{color:#888}
    th.sort-asc{color:#aaa} th.sort-desc{color:#aaa}
    .sort-arrow{font-size:.6rem;margin-left:3px;opacity:.4}
    th.sort-asc .sort-arrow::after{content:'▲';opacity:1}
    th.sort-desc .sort-arrow::after{content:'▼';opacity:1}
    td{padding:8px 12px 8px 0;border-bottom:1px solid #161616;vertical-align:middle}
    td.title{font-size:.85rem;color:#bbb;line-height:1.35}
    td.thumb{width:108px}
    td.thumb img{display:block;width:96px;height:54px;object-fit:cover;border-radius:2px;opacity:.85}
    .thumb-btn{position:relative;display:block;padding:0;border:none;background:none;cursor:pointer;border-radius:2px;overflow:hidden}
    .thumb-btn:hover img{opacity:1}
    .thumb-play{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
                background:rgba(0,0,0,.45);color:#fff;font-size:.75rem;opacity:0;transition:opacity .15s}
    .thumb-btn:hover .thumb-play{opacity:1}
    th.col-title{min-width:200px;width:22%}
    th.col-thumb{width:108px}
    th.col-role{min-width:180px;width:15%}
    th.col-client{min-width:150px;width:13%}
    th.col-genre{min-width:150px;width:13%}
    th.col-rec{min-width:140px;width:12%}
    th.col-notes{min-width:180px;width:18%}
    th.col-status{width:36px}
    textarea.notes-input{width:100%;background:#181818;border:1px solid #2e2e2e;border-radius:4px;
      color:#e5e5e5;font-size:.85rem;padding:6px 10px;outline:none;resize:vertical;
      font-family:inherit;line-height:1.4;transition:border-color .15s}
    textarea.notes-input:focus{border-color:#555}
    textarea.notes-input::placeholder{color:#555}

    /* ── multi-select ── */
    .ms{position:relative;user-select:none}
    .ms-face{display:flex;align-items:center;justify-content:space-between;
             background:#181818;border:1px solid #2e2e2e;border-radius:4px;
             padding:6px 10px;cursor:pointer;font-size:.85rem;gap:6px;
             transition:border-color .15s}
    .ms-face:hover,.ms:focus{outline:none}
    .ms:focus .ms-face,.ms.open .ms-face{border-color:#555}
    .ms-label{color:#e5e5e5;flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
    .ms-label.placeholder{color:#555}
    .ms-arrow{color:#555;font-size:.7rem;flex-shrink:0}
    .ms-drop{display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;
             background:#1a1a1a;border:1px solid #333;border-radius:4px;
             padding:6px 0;z-index:100;box-shadow:0 8px 24px rgba(0,0,0,.6)}
    .ms.open .ms-drop{display:block}
    .ms-drop label{display:flex;align-items:center;gap:8px;padding:6px 12px;
                   font-size:.85rem;cursor:pointer;transition:background .1s}
    .ms-drop label:hover{background:#252525}
    .ms-drop input[type=checkbox]{accent-color:#e5e5e5;flex-shrink:0}
    .ms-add-btn{display:block;width:100%;text-align:left;background:none;border:none;
                border-top:1px solid #2a2a2a;padding:6px 12px;margin-top:4px;
                color:#777;font-size:.8rem;cursor:pointer}
    .ms-add-btn:hover{color:#e5e5e5;background:#252525}

    /* ── client select ── */
    select{width:100%;background:#181818;border:1px solid #2e2e2e;border-radius:4px;
           color:#e5e5e5;font-size:.85rem;padding:6px 10px;outline:none;
           appearance:none;cursor:pointer;transition:border-color .15s}
    select:focus{border-color:#555}

    td.status{font-size:.8rem;width:36px}
    /* video modal */
    #vid-modal{display:none;position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.8);
               align-items:center;justify-content:center;padding:16px}
    #vid-modal.open{display:flex}
    #vid-box{position:relative;width:100%;max-width:900px;background:#111;border-radius:4px;overflow:hidden}
    #vid-box iframe{display:block;width:100%;aspect-ratio:16/9;border:none}
    #vid-meta{padding:16px 20px;display:flex;flex-direction:column;gap:6px}
    #vid-meta span.label{color:#666;font-size:.8rem}
    #vid-meta span.value{color:#e5e5e5;font-size:.8rem}
    #vid-close{position:absolute;top:10px;right:12px;background:none;border:none;
               color:#aaa;font-size:1.3rem;cursor:pointer;z-index:10;line-height:1}
    #vid-close:hover{color:#fff}
    td.status.ok{color:#4ade80}
    td.status.err{color:#f87171}
  </style>
</head>
<body>
  <h1>Film Metadata</h1>
  ${sections}
  ${stillsSection}

  <div id="vid-modal">
    <div id="vid-box">
      <button id="vid-close" aria-label="Close">✕</button>
      <div id="vid-player"></div>
      <div id="vid-meta"></div>
    </div>
  </div>

  <script>
    const ROLES = ${JSON.stringify(ROLES)};

    // ── Custom option storage ─────────────────────────────────────────────────
    const CUSTOM_KEYS = { client: 'customClients', genre: 'customGenres', recognition: 'customRecognition' };

    function getCustom(type) {
      try { return JSON.parse(localStorage.getItem(CUSTOM_KEYS[type]) || '[]'); } catch(e) { return []; }
    }
    function saveCustom(type, list) {
      localStorage.setItem(CUSTOM_KEYS[type], JSON.stringify(list));
    }

    // Insert a new option into every select of the given class, before the __add__ sentinel
    function addOptionToAll(selectClass, value) {
      document.querySelectorAll('.' + selectClass).forEach(sel => {
        if ([...sel.options].some(o => o.value === value)) return;
        const addOpt = sel.querySelector('option[value="__add__"]');
        const opt = document.createElement('option');
        opt.value = value;
        opt.textContent = value;
        sel.insertBefore(opt, addOpt);
      });
    }

    // Add a new checkbox to every recognition multi-select
    function addRecognitionOption(value) {
      document.querySelectorAll('.recognition-ms').forEach(ms => {
        if (ms.querySelector(\`input[value="\${value}"]\`)) return;
        const drop = ms.querySelector('.ms-drop');
        const addBtn = drop.querySelector('.ms-add-btn');
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.className = 'rec-cb'; cb.value = value;
        cb.addEventListener('change', () => { updateLabel(ms); scheduleSave(ms.closest('tr')); });
        label.appendChild(cb); label.appendChild(document.createTextNode(value));
        drop.insertBefore(label, addBtn);
      });
    }

    // Prompt for a new value, persist it, add to all selects, select it in the given select
    function promptAndAdd(type, selectClass, sel, row) {
      const val = prompt('Enter new ' + type + ':');
      if (!val || !val.trim()) { sel.value = ''; return; }
      const trimmed = val.trim();
      const custom = getCustom(type);
      if (!custom.includes(trimmed)) {
        custom.push(trimmed);
        saveCustom(type, custom);
      }
      addOptionToAll(selectClass, trimmed);
      sel.value = trimmed;
      scheduleSave(row);
    }

    // Load persisted custom options into all selects on startup
    ['client', 'genre'].forEach(type => {
      getCustom(type).forEach(val => addOptionToAll(type + '-select', val));
    });
    getCustom('recognition').forEach(val => addRecognitionOption(val));

    // ── Init each row ─────────────────────────────────────────────────────────
    document.querySelectorAll('tr[data-slug]').forEach(row => {
      const savedRoles       = row.dataset.role        ? row.dataset.role.split(', ').map(s => s.trim()) : [];
      const savedClient      = row.dataset.client      || '';
      const savedGenre       = row.dataset.genre       || '';
      const savedRecognition = row.dataset.recognition || '';

      // Check saved roles
      row.querySelectorAll('.ms-drop input[type=checkbox]').forEach(cb => {
        if (savedRoles.includes(cb.value)) cb.checked = true;
      });
      updateLabel(row.querySelector('.ms'));

      // Set saved client
      const clientSel = row.querySelector('.client-select');
      clientSel.value = savedClient;
      clientSel.addEventListener('change', () => {
        if (clientSel.value === '__add__') promptAndAdd('client', 'client-select', clientSel, row);
        else scheduleSave(row);
      });

      // Set saved genre
      const genreSel = row.querySelector('.genre-select');
      genreSel.value = savedGenre;
      genreSel.addEventListener('change', () => {
        if (genreSel.value === '__add__') promptAndAdd('genre', 'genre-select', genreSel, row);
        else scheduleSave(row);
      });

      // Check saved recognition checkboxes
      const savedRec = savedRecognition ? savedRecognition.split(', ').map(s => s.trim()) : [];
      row.querySelectorAll('.rec-cb').forEach(cb => {
        if (savedRec.includes(cb.value)) cb.checked = true;
      });
      updateLabel(row.querySelector('.recognition-ms'));

      // Notes textarea
      const notesTa = row.querySelector('.notes-input');
      notesTa.addEventListener('input', () => scheduleSave(row));

    });

    // ── Multi-select toggle ───────────────────────────────────────────────────
    function initMs(ms) {
      ms.querySelector('.ms-face').addEventListener('click', e => {
        e.stopPropagation();
        const wasOpen = ms.classList.contains('open');
        document.querySelectorAll('.ms.open').forEach(m => m.classList.remove('open'));
        if (!wasOpen) ms.classList.add('open');
      });
      ms.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => {
          updateLabel(ms);
          const row = ms.closest('tr');
          if (row.dataset.stillThumb) scheduleStillSave(row);
          else scheduleSave(row);
        });
      });
      const isRec = ms.classList.contains('recognition-ms');
      const addBtn = ms.querySelector('.ms-add-btn');
      if (addBtn && isRec) {
        addBtn.addEventListener('click', e => {
          e.stopPropagation();
          const val = prompt('Enter new recognition:');
          if (!val || !val.trim()) return;
          const trimmed = val.trim();
          const custom = getCustom('recognition');
          if (!custom.includes(trimmed)) { custom.push(trimmed); saveCustom('recognition', custom); }
          addRecognitionOption(trimmed);
          const cb = ms.querySelector(\`input[value="\${CSS.escape(trimmed)}"]\`);
          if (cb) { cb.checked = true; updateLabel(ms); scheduleSave(ms.closest('tr')); }
        });
      }
    }
    document.querySelectorAll('.ms').forEach(initMs);

    document.addEventListener('click', e => {
      if (!e.target.closest('.ms')) {
        document.querySelectorAll('.ms.open').forEach(m => m.classList.remove('open'));
      }
    });

    function updateLabel(ms) {
      const checked = [...ms.querySelectorAll('input:checked')].map(c => c.value);
      const label   = ms.querySelector('.ms-label');
      if (checked.length === 0) {
        label.textContent = 'Select…';
        label.classList.add('placeholder');
      } else {
        label.textContent = checked.join(', ');
        label.classList.remove('placeholder');
      }
    }

    // ── Video modal ───────────────────────────────────────────────────────────
    const vidModal  = document.getElementById('vid-modal');
    const vidPlayer = document.getElementById('vid-player');
    const vidMeta   = document.getElementById('vid-meta');
    const vidClose  = document.getElementById('vid-close');

    function openVideo(trailerUrl, role, client) {
      try {
        const url = new URL(trailerUrl);
        url.searchParams.set('autoplay', '1');
        trailerUrl = url.toString();
      } catch(e) {}
      const iframe = document.createElement('iframe');
      iframe.src = trailerUrl;
      iframe.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      iframe.setAttribute('allowfullscreen', '');
      vidPlayer.innerHTML = '';
      vidPlayer.appendChild(iframe);
      vidMeta.innerHTML = '';
      if (role)   vidMeta.innerHTML += \`<div><span class="label">Role: </span><span class="value">\${role}</span></div>\`;
      if (client) vidMeta.innerHTML += \`<div><span class="label">Client: </span><span class="value">\${client}</span></div>\`;
      vidModal.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function closeVideo() {
      vidModal.classList.remove('open');
      vidPlayer.innerHTML = '';
      document.body.style.overflow = '';
    }

    document.querySelectorAll('.thumb-btn:not(.still-thumb-btn)').forEach(btn => {
      btn.addEventListener('click', () => {
        const row    = btn.closest('tr');
        const role   = [...row.querySelectorAll('.ms-drop input:checked')].map(c => c.value).join(', ');
        const client = row.querySelector('.client-select').value;
        openVideo(btn.dataset.trailer, role, client);
      });
    });

    // ── Still image modal ─────────────────────────────────────────────────────
    document.querySelectorAll('.still-thumb-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const img = document.createElement('img');
        img.src = btn.dataset.img;
        img.style.cssText = 'width:100%;display:block;max-height:80vh;object-fit:contain;';
        vidPlayer.innerHTML = '';
        vidPlayer.appendChild(img);
        vidMeta.innerHTML = '';
        vidModal.classList.add('open');
        document.body.style.overflow = 'hidden';
      });
    });

    // ── Init stills rows ──────────────────────────────────────────────────────
    document.querySelectorAll('tr[data-still-thumb]').forEach(row => {
      const savedRoles  = row.dataset.role   ? row.dataset.role.split(', ').map(s => s.trim()) : [];
      const savedClient = row.dataset.client || '';

      row.querySelectorAll('.ms-drop input[type=checkbox]').forEach(cb => {
        if (savedRoles.includes(cb.value)) cb.checked = true;
      });
      updateLabel(row.querySelector('.ms'));

      const clientSel = row.querySelector('.client-select');
      clientSel.value = savedClient;
      clientSel.addEventListener('change', () => {
        if (clientSel.value === '__add__') promptAndAdd('client', 'client-select', clientSel, row);
        else scheduleStillSave(row);
      });

      const titleInput = row.querySelector('.title-input');
      titleInput.addEventListener('input', () => scheduleStillSave(row));

      const notesTa = row.querySelector('.notes-input');
      notesTa.value = row.dataset.notes || '';
      notesTa.addEventListener('input', () => scheduleStillSave(row));
    });

    const stillDebounceTimers = new WeakMap();
    function scheduleStillSave(row) {
      clearTimeout(stillDebounceTimers.get(row));
      stillDebounceTimers.set(row, setTimeout(() => saveStillRow(row), 400));
    }

    async function saveStillRow(row) {
      const thumbnail = row.dataset.stillThumb;
      const title     = row.querySelector('.title-input').value;
      const role      = [...row.querySelectorAll('.ms-drop input:checked')].map(c => c.value).join(', ');
      const client    = row.querySelector('.client-select').value;
      const notes     = row.querySelector('.notes-input').value;
      const status    = row.querySelector('.status');
      status.textContent = '…'; status.className = 'status';
      try {
        const res = await fetch('/save-still', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ thumbnail, title, role, client, notes }),
        });
        status.textContent = res.ok ? '✓' : '✗';
        status.className   = 'status ' + (res.ok ? 'ok' : 'err');
      } catch(e) {
        status.textContent = '✗'; status.className = 'status err';
      }
      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 2000);
    }
    vidClose.addEventListener('click', closeVideo);
    vidModal.addEventListener('click', e => { if (e.target === vidModal) closeVideo(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeVideo(); });

    // ── Auto-save ─────────────────────────────────────────────────────────────
    const debounceTimers = new WeakMap();

    function scheduleSave(row) {
      clearTimeout(debounceTimers.get(row));
      debounceTimers.set(row, setTimeout(() => saveRow(row), 400));
    }

    async function saveRow(row) {
      const slug        = row.dataset.slug;
      const role        = [...row.querySelectorAll('.ms-drop input:checked')].map(c => c.value).join(', ');
      const client      = row.querySelector('.client-select').value;
      const genre       = row.querySelector('.genre-select').value;
      const recognition = [...row.querySelectorAll('.rec-cb:checked')].map(c => c.value).join(', ');
      const notes       = row.querySelector('.notes-input').value;
      const status = row.querySelector('.status');
      status.textContent = '…';
      status.className   = 'status';
      try {
        const res = await fetch('/save', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ slug, role, client, genre, recognition, notes })
        });
        status.textContent = res.ok ? '✓' : '✗';
        status.className   = 'status ' + (res.ok ? 'ok' : 'err');
        if (res.ok) {
          row.dataset.role        = role;
          row.dataset.client      = client;
          row.dataset.genre       = genre;
          row.dataset.recognition = recognition;
          row.dataset.notes       = notes;
        }
      } catch(e) {
        status.textContent = '✗';
        status.className   = 'status err';
      }
      setTimeout(() => { status.textContent = ''; status.className = 'status'; }, 2000);
    }

    // ── Sort ──────────────────────────────────────────────────────────────────
    document.querySelectorAll('th.sortable').forEach(th => {
      th.addEventListener('click', () => {
        const table = th.closest('table');
        const tbody = table.querySelector('tbody');
        const col   = parseInt(th.dataset.col);
        const asc   = !th.classList.contains('sort-asc');

        // Clear all sort indicators in this table
        table.querySelectorAll('th.sortable').forEach(h => {
          h.classList.remove('sort-asc', 'sort-desc');
        });
        th.classList.add(asc ? 'sort-asc' : 'sort-desc');

        const rows = [...tbody.querySelectorAll('tr')];
        rows.sort((a, b) => {
          const getCellText = (row) => {
            const cell = row.cells[col];
            if (!cell) return '';
            // For multi-select cells, read the label text
            const label = cell.querySelector('.ms-label');
            if (label) return label.textContent.trim() === 'Select…' ? '' : label.textContent.trim();
            // For select dropdowns
            const sel = cell.querySelector('select');
            if (sel) return sel.options[sel.selectedIndex]?.text || '';
            return cell.textContent.trim();
          };
          const valA = getCellText(a).toLowerCase();
          const valB = getCellText(b).toLowerCase();
          if (valA === '' && valB !== '') return 1;
          if (valB === '' && valA !== '') return -1;
          return asc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  </script>
</body>
</html>`;
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

http.createServer((req, res) => {
  if (!requireAuth(req, res)) return;

  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    return res.end(renderPage());
  }
  if (req.method === 'POST' && req.url === '/save') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const { slug, role, client, genre, recognition, notes } = JSON.parse(body);
        const ok = saveFilm(slug, role, client, genre, recognition, notes);
        res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok }));
      } catch { res.writeHead(400); res.end(); }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/save-still') {
    let body = '';
    req.on('data', d => { body += d; });
    req.on('end', () => {
      try {
        const { thumbnail, title, role, client, notes } = JSON.parse(body);
        const ok = saveStill(thumbnail, title, role, client, notes);
        res.writeHead(ok ? 200 : 404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok }));
      } catch { res.writeHead(400); res.end(); }
    });
    return;
  }
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log(`Film admin → http://localhost:${PORT}`));
