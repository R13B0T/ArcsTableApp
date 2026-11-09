/* ═══════════════════════════════════════════════════════════
   ARCS CARD TRACKER — script.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── Constants ───────────────────────────────────────────────

const STORAGE_KEY = 'arcs-v2';
const PLAYERS = ['red', 'blue', 'gold', 'white'];
const BASE_DRAFT_COUNTS = { leader: 8, lore: 14 };
const CARD = {
  SONG: 'SONG OF FREEDOM (VOX)',
  STRUGGLE: 'GUILD STRUGGLE (VOX)',
  GUARDIANS: 'SWORN GUARDIANS (Guild)',
  NOBLE: 'NOBLE (Leader)',
};

// Which assign options appear per card type
const ASSIGN_OPTIONS = {
  court:  ['none', 'court', 'red', 'blue', 'gold', 'white'],
  leader: ['none', 'draft', 'red', 'blue', 'gold', 'white'],
  lore:   ['none', 'draft', 'red', 'blue', 'gold', 'white'],
};

const ASSIGN_TITLES = {
  none:  'Unassigned',
  court: 'In the Court',
  draft: 'In draft pool',
  red:   'Red player',
  blue:  'Blue player',
  gold:  'Gold player',
  white: 'White player',
};

// Keywords to bold in card descriptions
const KEYWORDS = [
  'When Secured:', 'Prelude:', 'Abduct \\(Battle\\):', 'Pressgang \\(Build\\):',
  'Execute \\(Influence\\):', 'Manufacture \\(Build\\):', 'Synthesize \\(Build\\):',
  'Trade \\(Tax\\):', 'Nurture \\(Build\\):', 'Prune \\(Repair\\):',
  'Fire Rifles \\(Battle\\):', 'Martyr \\(Move\\):', 'Annex \\(Build\\):',
  'Guide \\(Move\\):', 'Summon \\(Build\\):', 'Catapult \\(Move\\):',
];
const KEYWORD_RE = new RegExp(`(${KEYWORDS.join('|')})`, 'g');

// Court card states (game mode)
const CS = { DECK: 'deck', COURT: 'court', HELD: 'held', DISCARD: 'discard', RESOLVING: 'resolving' };

// ── State ────────────────────────────────────────────────────

let allCards = [];

let S = {
  assignments:  {},   // index → player string
  courtStates:  {},   // index → CS.*
  courtOrder:   [],   // shuffled indices of court cards
  courtRow:     null, // null until setup, then card indices or empty slots
  pendingVox:   null,
  drafting:     false,
  draftOrder:   [],
  includePack:  false,
  gameMode:     false,
  playerCount:  4,    // 2 / 3 / 4
  activeType:   'court',
  activePlayer: 'all',
  search:       '',
};

// ── Persistence ──────────────────────────────────────────────

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    assignments: S.assignments,
    courtStates: S.courtStates,
    courtOrder:  S.courtOrder,
    courtRow:    S.courtRow,
    pendingVox:  S.pendingVox,
    drafting:    S.drafting,
    draftOrder:  S.draftOrder,
    includePack: S.includePack,
    gameMode:    S.gameMode,
    playerCount: S.playerCount,
  }));
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const d = JSON.parse(raw);
    S.assignments = d.assignments || {};
    S.courtStates = d.courtStates || {};
    S.courtOrder  = d.courtOrder  || [];
    S.courtRow    = d.courtRow ?? null;
    S.pendingVox  = d.pendingVox ?? null;
    S.drafting    = d.drafting === true;
    S.draftOrder  = d.draftOrder || [];
    S.includePack = d.includePack === true;
    S.gameMode    = d.gameMode    || false;
    S.playerCount = d.playerCount || 4;
  } catch (_) { /* ignore corrupt data */ }
}

function hardReset() {
  S.assignments = {};
  S.courtStates = {};
  S.courtOrder  = [];
  S.courtRow    = null;
  S.pendingVox  = null;
  S.drafting    = false;
  S.draftOrder  = [];
  S.gameMode    = false;
  save();
}

// ── Boot ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  load();

  try {
    const res  = await fetch('cards.json');
    const data = await res.json();
    allCards   = data.cards;
  } catch (err) {
    console.error('Could not load cards.json', err);
    document.getElementById('cards-grid').textContent = 'Error loading card data.';
    return;
  }

  restoreCourt();
  bindEvents();
  applyGameMode();
  render();
});

// ── Event binding ────────────────────────────────────────────

function bindEvents() {
  // Type tabs
  document.querySelectorAll('.type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.type-tab').forEach(b => {
        b.classList.remove('is-active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('is-active');
      btn.setAttribute('aria-selected', 'true');
      S.activeType = btn.dataset.type;
      render();
    });
  });

  // Player filters
  document.querySelectorAll('.p-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.p-filter').forEach(b => b.classList.remove('is-active'));
      btn.classList.add('is-active');
      S.activePlayer = btn.dataset.player;
      render();
    });
  });

  // Search
  document.getElementById('search').addEventListener('input', e => {
    S.search = e.target.value.trim().toLowerCase();
    render();
  });

  // New Game
  document.getElementById('btn-reset').addEventListener('click', () => {
    if (!confirm('Start a new game? All assignments will be cleared.')) return;
    hardReset();
    document.getElementById('game-mode-toggle').checked = false;
    applyGameMode();
    render();
  });

  document.getElementById('game-mode-toggle').addEventListener('change', e => {
    S.gameMode = e.target.checked;
    save();
    applyGameMode();
    render();
  });

  document.getElementById('btn-setup-court').addEventListener('click', setupCourt);
  document.getElementById('btn-noble').addEventListener('click', secureWithNoble);

  document.querySelectorAll('.pc-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      S.playerCount = Number(btn.dataset.pc);
      syncPlayerCount();
      save();
    });
  });

  document.getElementById('include-pack').addEventListener('change', e => {
    S.includePack = e.target.checked;
    save();
  });

  document.getElementById('btn-draft').addEventListener('click', () => {
    const count = S.playerCount + 1;
    if (!confirm(`Reveal ${count} Leaders and ${count} Lore cards? This replaces existing Leader and Lore assignments.`)) return;
    startDraft();
  });
}

// ── Game mode ────────────────────────────────────────────────

function courtIndices() {
  return allCards.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'court').map(({ i }) => i);
}

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}

function restoreCourt() {
  // Older saves tracked face-up cards without slots.
  if (S.courtRow !== null || S.courtOrder.length === 0) return;
  const indices = courtIndices();
  if (indices.every(i => S.courtStates[i] === CS.DECK)) return;

  S.courtOrder = S.courtOrder.filter(i => S.courtStates[i] === CS.DECK || !S.courtStates[i]);
  S.courtRow = indices.filter(i => S.courtStates[i] === CS.COURT);
  while (S.courtRow.length < (S.playerCount === 2 ? 3 : 4)) S.courtRow.push(null);
  indices.forEach(i => {
    if (S.courtStates[i] === CS.COURT) S.assignments[i] = 'court';
    else if (S.courtStates[i] !== CS.HELD) delete S.assignments[i];
  });
}

function setupCourt() {
  if (S.courtRow !== null) return;

  const indices = courtIndices();
  S.courtOrder = shuffle(indices);
  indices.forEach(i => {
    S.courtStates[i] = CS.DECK;
    delete S.assignments[i];
  });
  S.courtRow = Array.from({ length: S.playerCount === 2 ? 3 : 4 }, drawToCourt);
  selectView('court', 'court');
  save();
  render();
}

function drawToCourt() {
  const next = S.courtOrder.shift();
  if (next === undefined) return null;
  S.courtStates[next] = CS.COURT;
  S.assignments[next] = 'court';
  return next;
}

function isVox(card) {
  return card.title.endsWith('(VOX)');
}

function finishVox(idx) {
  if (S.pendingVox !== idx) return;
  const title = allCards[idx].title;
  const slot = S.courtRow.indexOf(idx);
  delete S.assignments[idx];
  S.courtStates[idx] = CS.DISCARD;

  if (title === CARD.SONG) {
    S.courtStates[idx] = CS.DECK;
    S.courtOrder = shuffle([...S.courtOrder, idx]);
  } else if (title === CARD.STRUGGLE) {
    const guilds = courtIndices().filter(i => S.courtStates[i] === CS.DISCARD && !isVox(allCards[i]));
    guilds.forEach(i => { S.courtStates[i] = CS.DECK; });
    S.courtOrder = shuffle([...S.courtOrder, ...guilds]);
  }

  S.pendingVox = null;
  if (slot !== -1) S.courtRow[slot] = drawToCourt();
  save();
  render();
}

function nobleOwner() {
  const idx = allCards.findIndex(card => card.title === CARD.NOBLE);
  return S.assignments[idx];
}

function secureWithNoble() {
  const owner = nobleOwner();
  if (!PLAYERS.includes(owner) || !S.courtRow || S.pendingVox !== null || !S.courtOrder.length) return;
  const idx = S.courtOrder.shift();
  if (isVox(allCards[idx])) {
    S.courtStates[idx] = CS.RESOLVING;
    S.pendingVox = idx;
    selectView('court', 'all');
  } else {
    S.courtStates[idx] = CS.HELD;
    S.assignments[idx] = owner;
    selectView('court', owner);
  }
  save();
  render();
}

function moveCourtCard(idx, action) {
  const state = S.courtStates[idx];
  const card = allCards[idx];

  if (action === 'finish') {
    finishVox(idx);
    return;
  }

  if (state === CS.COURT && S.pendingVox === null) {
    if (isVox(card)) {
      if (action !== 'resolve') return;
      S.pendingVox = idx;
    } else {
      if (!PLAYERS.includes(action)) return;
      S.courtStates[idx] = CS.HELD;
      S.assignments[idx] = action;
      S.courtRow[S.courtRow.indexOf(idx)] = drawToCourt();
    }
  } else if (state === CS.HELD) {
    if (action === 'none' || action === 'bury') {
      delete S.assignments[idx];
      S.courtStates[idx] = action === 'bury' ? CS.DECK : CS.DISCARD;
      if (action === 'bury') S.courtOrder.push(idx);
    } else {
      if (!PLAYERS.includes(action) || card.title === CARD.GUARDIANS) return;
      S.assignments[idx] = action;
    }
  } else {
    return;
  }

  save();
  render();
}

function updateStats() {
  const all     = courtIndices();
  const deck    = all.filter(i => (S.courtStates[i] || CS.DECK) === CS.DECK).length;
  const court   = all.filter(i => S.courtStates[i] === CS.COURT).length;
  const held    = all.filter(i => S.courtStates[i] === CS.HELD).length;
  const discard = all.filter(i => S.courtStates[i] === CS.DISCARD).length;
  document.getElementById('stat-deck').textContent    = deck;
  document.getElementById('stat-court').textContent   = court;
  document.getElementById('stat-held').textContent    = held;
  document.getElementById('stat-discard').textContent = discard;
}

function applyGameMode() {
  const app     = document.getElementById('app');
  const gameBar = document.getElementById('game-bar');
  const toggle  = document.getElementById('game-mode-toggle');
  toggle.checked = S.gameMode;
  if (S.gameMode) {
    app.classList.add('game-active');
    gameBar.hidden = false;
  } else {
    app.classList.remove('game-active');
    gameBar.hidden = true;
  }
}

// ── Leaders & Lore draft ───────────────────────────────────

function startDraft() {
  for (const type of ['leader', 'lore']) {
    const indices = allCards.flatMap((card, i) => card.type === type ? [i] : []);
    indices.forEach(i => { delete S.assignments[i]; });
    // Each type is listed in publisher order, with the base cards before the add-on pack.
    const pool = S.includePack ? indices : indices.slice(0, BASE_DRAFT_COUNTS[type]);
    shuffle(pool).slice(0, S.playerCount + 1).forEach(i => { S.assignments[i] = 'draft'; });
  }
  S.drafting = true;
  S.draftOrder = [];
  selectView('leader', 'draft');
  save();
  render();
}

function draftedPlayers(type) {
  return new Set(allCards.flatMap((card, i) => {
    const owner = S.assignments[i];
    return card.type === type && PLAYERS.includes(owner) ? [owner] : [];
  }));
}

function nextDrafter() {
  if (S.draftOrder.length < S.playerCount) return null;
  const picks = draftedPlayers('leader').size + draftedPlayers('lore').size;
  return S.draftOrder[picks % S.playerCount];
}

function draftOptions(type) {
  const next = nextDrafter();
  if (next === null) return PLAYERS.filter(p => !S.draftOrder.includes(p));
  return draftedPlayers(type).has(next) ? [] : [next];
}

function pickDraftCard(idx, player) {
  if (S.assignments[idx] !== 'draft' || !draftOptions(allCards[idx].type).includes(player)) return;
  if (S.draftOrder.length < S.playerCount) S.draftOrder.push(player);
  S.assignments[idx] = player;
  if (draftedPlayers('leader').size === S.playerCount && draftedPlayers('lore').size === S.playerCount) {
    S.drafting = false;
    S.draftOrder = [];
    Object.keys(S.assignments).forEach(i => {
      if (S.assignments[i] === 'draft') delete S.assignments[i];
    });
    selectView('leader', 'all');
  }
  save();
  render();
}

function selectView(type, player) {
  S.activeType = type;
  S.activePlayer = player;
  S.search = '';
  document.getElementById('search').value = '';
  document.querySelectorAll('.type-tab').forEach(btn => {
    const active = btn.dataset.type === type;
    btn.classList.toggle('is-active', active);
    btn.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('.p-filter').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.player === player);
  });
}

function syncPlayerCount() {
  document.querySelectorAll('.pc-btn').forEach(btn => {
    btn.classList.toggle('is-active', Number(btn.dataset.pc) === S.playerCount);
    btn.disabled = S.courtRow !== null || S.drafting;
  });
}

function renderGameControls() {
  syncPlayerCount();
  document.getElementById('btn-setup-court').hidden = S.courtRow !== null;
  const noble = document.getElementById('btn-noble');
  noble.hidden = S.courtRow === null || !PLAYERS.includes(nobleOwner());
  noble.disabled = S.pendingVox !== null || S.courtOrder.length === 0;
  document.getElementById('btn-draft').disabled = S.drafting;
  const pack = document.getElementById('include-pack');
  pack.checked = S.includePack;
  pack.disabled = S.drafting;
  const note = document.getElementById('game-note');
  const pending = S.pendingVox !== null;
  const drafter = S.drafting ? nextDrafter() : null;
  note.hidden = !S.gameMode || (!pending && !S.drafting);
  note.textContent = pending
    ? 'Resolve the Vox effect at the table, record any card transfers or discards here, then finish the Vox card.'
    : drafter
      ? `Next pick: ${ASSIGN_TITLES[drafter]}. Open the Leader or Lore tab to pick the type they still need.`
      : 'For the first pass, pick in reverse turn order, starting to the right of the player with initiative.';
  updateStats();
}

// ── Render ───────────────────────────────────────────────────

function render() {
  renderGameControls();
  const grid  = document.getElementById('cards-grid');
  const empty = document.getElementById('empty-state');

  let cards = allCards
    .map((card, i) => ({ ...card, idx: i }))
    .filter(c => c.type === S.activeType);

  // Player filter
  if (S.activePlayer !== 'all') {
    cards = cards.filter(c => (S.assignments[c.idx] || 'none') === S.activePlayer);
  }

  // Search
  if (S.search) {
    cards = cards.filter(c =>
      c.title.toLowerCase().includes(S.search) ||
      c.description.toLowerCase().includes(S.search)
    );
  }

  if (S.gameMode && S.activeType === 'court') {
    // Preserve row positions and keep the identities of undrawn cards private.
    const rank = card => {
      if (S.courtStates[card.idx] === CS.RESOLVING) return -1;
      const slot = S.courtRow?.indexOf(card.idx) ?? -1;
      if (slot !== -1) return slot;
      return (S.courtRow?.length ?? 0) + (S.courtStates[card.idx] === CS.HELD ? 0 : 1);
    };
    cards = cards.filter(c => S.courtStates[c.idx] && S.courtStates[c.idx] !== CS.DECK);
    cards.sort((a, b) => rank(a) - rank(b));
  }

  grid.innerHTML = '';

  if (cards.length === 0) {
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  const frag = document.createDocumentFragment();
  cards.forEach(card => frag.appendChild(buildCard(card)));
  grid.appendChild(frag);
}

// ── Card builder ─────────────────────────────────────────────

function buildCard(card) {
  const idx      = card.idx;
  const assigned = S.assignments[idx] || 'none';
  const cState   = S.courtStates[idx] || CS.DECK;

  const controls = buildCardControls(card, assigned, cState);
  const el = document.createElement('article');
  el.className  = 'card';
  el.dataset.type = card.type;
  if (assigned !== 'none') el.dataset.assigned = assigned;
  if (S.gameMode && card.type === 'court') el.classList.add(`state--${cState}`);

  // Strip the "(Type)" suffix from title for display
  const displayTitle = card.title.replace(/\s*\([^)]+\)\s*$/, '').trim();
  // Use the parenthetical part as the badge label
  const badgeMatch   = card.title.match(/\(([^)]+)\)/);
  const badge        = badgeMatch ? badgeMatch[1].toUpperCase() : card.type.toUpperCase();

  el.innerHTML = `
    <div class="card__head">
      <span class="card__badge">${badge}</span>
      <h2 class="card__title">${displayTitle}</h2>
    </div>
    <div class="card__body">
      <p class="card__desc">${formatDesc(card.description)}</p>
    </div>
    ${controls ? `<div class="card__foot">${controls}</div>` : ''}
  `;

  el.querySelectorAll('[data-a]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.a;
      if (card.type === 'court' && S.courtRow !== null) {
        if (S.gameMode) moveCourtCard(idx, action);
      } else if (card.type !== 'court' && S.drafting) {
        if (S.gameMode) pickDraftCard(idx, action);
      } else {
        S.assignments[idx] = action;
        save();
        render();
      }
    });
  });
  return el;
}

function buildCardControls(card, assigned, state) {
  if (card.type === 'court' && S.courtRow !== null) {
    if (!S.gameMode) return '';
    if (S.pendingVox === card.idx) {
      return actionButton('finish', 'Finish Vox');
    }
    if (state === CS.COURT && S.pendingVox === null) {
      return isVox(card)
        ? actionButton('resolve', 'Resolve Vox')
        : playerButtons('Secure for', PLAYERS, assigned);
    }
    if (state === CS.HELD) {
      const discard = actionButton('none', 'Discard');
      if (card.title === CARD.GUARDIANS) {
        return actionButton('bury', 'Bury if stolen') + discard;
      }
      return playerButtons('Transfer to', PLAYERS.filter(p => p !== assigned), assigned) + discard;
    }
    return '';
  }

  if (card.type !== 'court' && S.drafting) {
    return S.gameMode && assigned === 'draft'
      ? playerButtons('Draft for', draftOptions(card.type), assigned)
      : '';
  }

  return playerButtons('Assign', ASSIGN_OPTIONS[card.type], assigned);
}

function playerButtons(label, options, assigned) {
  if (options.length === 0) return '';
  return `<span class="assign-lbl">${label}</span>` + options.map(opt => {
    const title = ASSIGN_TITLES[opt];
    return `<button class="a-btn${assigned === opt ? ' on' : ''}" data-a="${opt}"
      title="${title}" aria-label="${label}: ${title}" aria-pressed="${assigned === opt}"></button>`;
  }).join('');
}

function actionButton(action, label) {
  return `<button class="btn btn--outline" data-a="${action}">${label}</button>`;
}

function formatDesc(text) {
  return text.replace(KEYWORD_RE, '<strong>$1</strong>');
}
