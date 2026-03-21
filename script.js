/* ═══════════════════════════════════════════════════════════
   ARCS CARD TRACKER — script.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

// ── Constants ───────────────────────────────────────────────

const STORAGE_KEY = 'arcs-v2';

// Which assign options appear per card type
const ASSIGN_OPTIONS = {
  court:  ['none', 'court', 'red', 'blue', 'gold', 'white'],
  leader: ['none', 'red', 'blue', 'gold', 'white'],
  lore:   ['none', 'draft', 'red', 'blue', 'gold', 'white'],
};

const ASSIGN_TITLES = {
  none:  'Unassigned',
  court: 'In the Court',
  draft: 'Draft pile',
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
const CS = { DECK: 'deck', COURT: 'court', HELD: 'held', DISCARD: 'discard' };

// ── State ────────────────────────────────────────────────────

let allCards = [];

let S = {
  assignments:  {},   // index → player string
  courtStates:  {},   // index → CS.*
  courtOrder:   [],   // shuffled indices of court cards
  gameMode:     false,
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
    gameMode:    S.gameMode,
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
    S.gameMode    = d.gameMode    || false;
  } catch (_) { /* ignore corrupt data */ }
}

function hardReset() {
  S.assignments = {};
  S.courtStates = {};
  S.courtOrder  = [];
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

  // Game mode toggle
  document.getElementById('game-mode-toggle').addEventListener('change', e => {
    S.gameMode = e.target.checked;
    if (S.gameMode && S.courtOrder.length === 0) {
      shuffleCourtDeck();
    }
    save();
    applyGameMode();
    render();
  });

  // Draw card
  document.getElementById('btn-draw').addEventListener('click', drawCard);

  // Reset deck
  document.getElementById('btn-reset-deck').addEventListener('click', resetDeck);
}

// ── Game mode ────────────────────────────────────────────────

function courtIndices() {
  return allCards.map((c, i) => ({ c, i })).filter(({ c }) => c.type === 'court').map(({ i }) => i);
}

function shuffleCourtDeck() {
  const indices = courtIndices();
  // Fisher-Yates
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  S.courtOrder = indices;
  indices.forEach(i => { S.courtStates[i] = CS.DECK; });
  save();
}

function drawCard() {
  // Find the next DECK card in shuffled order
  const next = S.courtOrder.find(i => (S.courtStates[i] || CS.DECK) === CS.DECK);
  if (next === undefined) return;
  S.courtStates[next] = CS.COURT;
  save();
  updateStats();
  render();
}

function resetDeck() {
  if (!confirm('Shuffle all non-held court cards back into the deck?')) return;
  // Collect non-held indices and reshuffle them
  const all     = courtIndices();
  const held    = all.filter(i => S.courtStates[i] === CS.HELD);
  const returns = all.filter(i => S.courtStates[i] !== CS.HELD);
  // Shuffle returns
  for (let i = returns.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [returns[i], returns[j]] = [returns[j], returns[i]];
  }
  returns.forEach(i => { S.courtStates[i] = CS.DECK; });
  S.courtOrder = [...returns, ...held];
  save();
  updateStats();
  render();
}

function setCourtState(idx, newState) {
  S.courtStates[idx] = newState;
  // Clear assignment when leaving play
  if (newState === CS.DECK || newState === CS.DISCARD) {
    delete S.assignments[idx];
  }
  // Mark as held when assigned to a player
  if (newState === CS.HELD) {
    // assignment handled by assign buttons
  }
  save();
  updateStats();
  render();
}

function updateStats() {
  const all     = courtIndices();
  const deck    = all.filter(i => (S.courtStates[i] || CS.DECK) === CS.DECK).length;
  const court   = all.filter(i => S.courtStates[i] === CS.COURT).length;
  const discard = all.filter(i => S.courtStates[i] === CS.DISCARD).length;
  document.getElementById('stat-deck').textContent    = deck;
  document.getElementById('stat-court').textContent   = court;
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
    updateStats();
  } else {
    app.classList.remove('game-active');
    gameBar.hidden = true;
  }
}

// ── Render ───────────────────────────────────────────────────

function render() {
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

  // In game mode, sort court cards: court row → held → deck → discard
  if (S.gameMode && S.activeType === 'court') {
    const order = { [CS.COURT]: 0, [CS.HELD]: 1, [CS.DECK]: 2, [CS.DISCARD]: 3 };
    cards.sort((a, b) => {
      const sa = order[S.courtStates[a.idx] || CS.DECK] ?? 2;
      const sb = order[S.courtStates[b.idx] || CS.DECK] ?? 2;
      return sa - sb;
    });
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
    <div class="card__foot">
      <span class="assign-lbl">ASSIGN</span>
      ${buildAssignBtns(idx, assigned, card.type)}
      ${card.type === 'court' ? buildStateBtns(idx, cState) : ''}
    </div>
  `;

  // Assign button events
  el.querySelectorAll('.a-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.a;
      S.assignments[idx] = val;
      // Game mode: mirror assignment to courtState
      if (S.gameMode && card.type === 'court') {
        if (val !== 'none' && val !== 'court') {
          S.courtStates[idx] = CS.HELD;
        } else if (val === 'court') {
          S.courtStates[idx] = CS.COURT;
        }
      }
      save();
      updateStats();
      render();
    });
  });

  // State button events
  el.querySelectorAll('.s-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      setCourtState(idx, btn.dataset.s);
    });
  });

  return el;
}

function buildAssignBtns(idx, assigned, type) {
  return ASSIGN_OPTIONS[type].map(opt =>
    `<button
       class="a-btn${assigned === opt ? ' on' : ''}"
       data-a="${opt}"
       title="${ASSIGN_TITLES[opt]}"
       aria-label="${ASSIGN_TITLES[opt]}"
       aria-pressed="${assigned === opt}"
     ></button>`
  ).join('');
}

function buildStateBtns(idx, cState) {
  const states = [
    { key: CS.DECK,    label: 'DECK'    },
    { key: CS.COURT,   label: 'COURT'   },
    { key: CS.DISCARD, label: 'DISCARD' },
  ];
  return `<div class="card__state-btns">${
    states.map(s =>
      `<button class="s-btn${cState === s.key ? ' on' : ''}" data-s="${s.key}" title="Move to ${s.label.toLowerCase()}">${s.label}</button>`
    ).join('')
  }</div>`;
}

// ── Helpers ──────────────────────────────────────────────────

function formatDesc(text) {
  return text.replace(KEYWORD_RE, '<strong>$1</strong>');
}
