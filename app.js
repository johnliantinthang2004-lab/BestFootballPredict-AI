const MARKET_DEFINITIONS = [
  { key: 'primary', label: 'Primary Result' },
  { key: 'doubleChance', label: 'Double Chance' },
  { key: 'totalGoals', label: 'Total Goals' }
];

const stories = {
  press: {
    category: 'FORM ANALYSIS', readTime: '6 MIN READ', title: 'The press that bends a match',
    dek: 'A high press is more than a sprint toward the ball. The shape behind the first challenge often decides whether pressure becomes a chance or a quick escape.',
    sections: [
      ['Start with the trigger', 'Watch for the moment a side chooses to jump: a backward pass, a touch toward the touchline, or a receiver facing their own goal. A coordinated press narrows the easy exits instead of sending one player chasing alone.'],
      ['Follow the next touch', 'The second ball tells a deeper story than the first tackle. Note whether a nearby midfielder can collect a hurried clearance, and whether the defensive line steps up together to keep the pitch compact.'],
      ['Keep the context close', 'Score, fatigue and substitutions can change the risk calculation. These are useful prompts for watching form; they are not a live reading of a confirmed fixture.']
    ]
  },
  injuries: {
    category: 'INJURY WATCH', readTime: '4 MIN READ', title: 'The selection room: who might be missing',
    dek: 'Availability changes the shape of a preview. A responsible team-news note separates confirmed absences from late fitness calls and explains what each could alter.',
    sections: [
      ['Separate confirmed from doubtful', 'A useful injury monitor labels information by confidence and timestamp. “Out” belongs to a confirmed club update; “late call” signals uncertainty. Avoid turning a training-ground rumour into a starting-lineup claim.'],
      ['Ask what the role does', 'If a player is unavailable, describe the responsibility the team may need to replace: ball progression, width, aerial cover or pressing intensity. The likely tactical adjustment is more useful than speculation about a name.'],
      ['Check again before kick-off', 'This is an editorial template, not current injury reporting. Verify the latest official club or league communication and update the note when the line-up is confirmed.']
    ]
  },
  derby: {
    category: 'MATCH PREVIEW', readTime: '8 MIN READ', title: 'A derby of details',
    dek: 'Big fixtures are often settled by small distances: who controls the space after a turnover, who wins the second ball, and which side finds a calm first pass.',
    sections: [
      ['The opening quarter-hour', 'An early press can set the emotional tempo, but it also spends energy. Look for whether the first line can close down while the midfield remains connected behind it.'],
      ['Three useful duels', 'Track the wide defender against the winger, the holding midfielder protecting the space in front of the centre-backs, and the forward contesting clearances. Those match-ups help explain where territory may tilt.'],
      ['Plan for both game states', 'A preview should consider what changes if the first goal arrives early. A side protecting a lead may defend deeper; a team chasing the match may expose space behind its full-backs. This is illustrative analysis, not a prediction about a live derby.']
    ]
  }
};

const MARKET_FORMATS = {
  primary: 'Home Win · Draw · Away Win',
  doubleChance: '1X · 12 · X2',
  totalGoals: 'Over/Under 2.5 goals'
};
const MARKET_CODES = { primary: '1X2', doubleChance: 'DOUBLE CHANCE', totalGoals: 'TOTAL GOALS' };
const PAGE_SIZE = 24;
const MAX_AUTO_RETRIES = 3;

const fixtureGrid = document.querySelector('#fixture-grid');
const fixtureCount = document.querySelector('#fixture-count');
const scheduleNotice = document.querySelector('#schedule-notice');
const filters = [...document.querySelectorAll('[data-filter]')];
const leagueSearch = document.querySelector('#league-search');
const leagueSearchEmpty = document.querySelector('#league-search-empty');
const activeFilterLabel = document.querySelector('#active-filter-label');
const vipDialog = document.querySelector('#vip-dialog');
const articleDialog = document.querySelector('#article-dialog');
const selectedPlanLabel = document.querySelector('#selected-plan-label');
const dialogStatus = document.querySelector('#dialog-status');
let activeFilter = 'all';
let fixtures = [];
let leagueStatus = [];
let fixtureLoadPending = false;
let visibleLimit = PAGE_SIZE;
let autoRetries = 0;
let retryTimer = null;

function escapeHTML(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function normalizeApiTimestamp(value) {
  if (typeof value !== 'string') return value;
  return /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(value) ? `${value}Z` : value;
}

function utcKickoff(value) {
  const date = new Date(normalizeApiTimestamp(value));
  if (Number.isNaN(date.getTime())) return 'Kickoff time TBC';
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'UTC', hour12: false
  }).format(date) + ' UTC';
}

function utcStamp(value) {
  if (!value) return 'UTC · —';
  const date = new Date(normalizeApiTimestamp(value));
  if (Number.isNaN(date.getTime())) return 'UTC · —';
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false }).format(date) + ' · UTC';
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== '';
}

function crestFallbackMarkup(name, fallback, hidden = false, label = 'club crest unavailable') {
  return `<span class="crest-fallback" ${hidden ? 'hidden' : ''} role="img" aria-label="${name} ${escapeHTML(label)}"><svg viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path d="M20 3 34 8v11c0 9-5.7 14.8-14 18C11.7 33.8 6 28 6 19V8l14-5Z" fill="#18251b" stroke="#D6FA63" stroke-opacity=".52"/><path d="M11 11h18v2H11z" fill="#D6FA63" fill-opacity=".22"/><text x="20" y="23" text-anchor="middle" dominant-baseline="middle" fill="#D6FA63" font-family="monospace" font-size="9" font-weight="700">${fallback}</text></svg></span>`;
}

function crestMarkup(team) {
  const teamName = String(team?.name || 'Unknown team');
  const name = escapeHTML(teamName);
  const fallback = escapeHTML(team?.fallback || teamName.slice(0, 3).toUpperCase());
  const logoUrl = [team?.crestUrl, team?.logoUrl, team?.logo, team?.badgeUrl]
    .find((url) => typeof url === 'string' && /^https:\/\//i.test(url));
  if (!logoUrl) return `<span class="crest-wrap">${crestFallbackMarkup(name, fallback)}</span>`;
  const source = escapeHTML(team?.crestSource || 'Source club crest');
  return `<span class="crest-wrap"><img class="club-crest" src="${escapeHTML(logoUrl)}" alt="${name} club crest" title="${source}" loading="lazy" decoding="async" referrerpolicy="no-referrer">${crestFallbackMarkup(name, fallback, true)}</span>`;
}

function showCrestFallback(image) {
  image.hidden = true;
  const fallback = image.nextElementSibling;
  if (fallback) fallback.hidden = false;
}

function priceMarkup(odds) {
  const decimal = Number(odds?.decimal);
  if (!Number.isFinite(decimal) || decimal <= 1) return '<span class="market-odds market-odds-none">MODEL ONLY · NO SOURCE PRICE</span>';
  const provider = escapeHTML(odds.provider || 'Source');
  return `<span class="market-odds" title="${provider} price published via ESPN">@ ${decimal.toFixed(2)} <small>${provider}</small></span>`;
}

function marketMarkup(market) {
  const verified = market.state === 'verified';
  const probability = Number(market.probability);
  const hasProbability = Number.isFinite(probability) && probability >= 0 && probability <= 100;
  const confidence = ['High', 'Medium', 'Low'].includes(market.confidence) ? market.confidence : '';
  const stateLabel = verified ? 'VERIFIED PICK' : 'MODEL PICK';
  return `<div class="market-cell market-${escapeHTML(market.key)} ${verified ? 'market-verified' : 'market-model'}">
    <div class="market-cell-top"><span class="market-label">${escapeHTML(market.label)}</span><span class="market-code">${escapeHTML(MARKET_CODES[market.key] || 'MARKET')}</span></div>
    <strong class="market-pick">${escapeHTML(market.value)}</strong>
    <span class="market-format">${escapeHTML(MARKET_FORMATS[market.key] || '')}</span>
    ${hasProbability ? `<div class="market-meter" aria-hidden="true"><span style="width:${probability.toFixed(1)}%"></span></div><span class="market-probability">${probability.toFixed(1)}% model probability</span>` : ''}
    <div class="market-meta"><span class="market-state">${stateLabel}${confidence ? ` · ${escapeHTML(confidence.toUpperCase())} CONFIDENCE` : ''}</span>${priceMarkup(market.odds)}</div>
  </div>`;
}

function fixtureMarkets(markets) {
  const byKey = new Map((Array.isArray(markets) ? markets : []).map((market) => [market?.key, market]));
  return MARKET_DEFINITIONS.map(({ key, label }) => {
    const market = byKey.get(key);
    if (!market || !hasValue(market.value) || !['model', 'verified'].includes(market.state)) return null;
    return { ...market, key, label: key === 'totalGoals' ? 'Total Goals' : label };
  });
}

function isCompleteFixture(match) {
  return Boolean(match?.home?.name && match?.away?.name && match?.league?.id && match?.kickoffUtc)
    && fixtureMarkets(match.markets).every(Boolean);
}

function formMarkup(form, side) {
  const results = Array.isArray(form) ? form.filter((item) => ['W', 'D', 'L'].includes(item)) : [];
  const titles = { W: 'Win', D: 'Draw', L: 'Loss' };
  const pills = results.length
    ? results.map((item) => `<i class="form-pill form-${item.toLowerCase()}" title="${titles[item]}">${item}</i>`).join('')
    : '<span class="form-empty">No results yet</span>';
  return `<span class="form-strip form-${side}" aria-label="${side} team form, oldest to newest: ${escapeHTML(results.join(' ') || 'none')}">${pills}</span>`;
}

function intelStatus(match) {
  const status = match.evaluation || {};
  if (status.verified === true) return { tone: 'verified', label: '48h Pre-Match Intel & Injury Checked' };
  if (status.inWindow) return { tone: 'window', label: '48h Pre-Match Intel & Injury Check · window open · injuries not verified' };
  return { tone: 'scheduled', label: `48h Pre-Match Intel & Injury Check · window opens ${utcStamp(status.windowOpensUtc)}` };
}

function evidenceMarkup(items = []) {
  const records = Array.isArray(items) ? items : [];
  const checked = records.filter((item) => item.state === 'checked').length;
  const labels = { checked: 'CHECKED', pending: 'NO DATA YET', not_assessed: 'NOT ASSESSED', not_connected: 'NOT CONNECTED' };
  const rows = records.map((item) => {
    const state = Object.prototype.hasOwnProperty.call(labels, item.state) ? item.state : 'pending';
    return `<li class="ev-${state}"><span>${escapeHTML(item.label)}</span><b>${labels[state]}</b>${item.detail ? `<small>${escapeHTML(item.detail)}</small>` : ''}</li>`;
  }).join('');
  return `<details class="evidence-details">
    <summary><span class="evidence-summary-title">Form · head-to-head · rest · injury status</span><span class="evidence-summary-count">${escapeHTML(records.length ? `${checked}/${records.length} checked from results` : 'No checks attached')}</span></summary>
    <div class="evidence-details-body">
      ${rows ? `<ul class="evidence-list">${rows}</ul>` : ''}
      <p class="evidence-safety-note">The 48h indicator is informational: picks are never hidden or locked. Injury, suspension and lineup data are not connected, so no injury check is claimed.</p>
    </div>
  </details>`;
}

function sourcePricesMarkup(odds) {
  if (!odds?.available) return '';
  const fmt = (value) => (Number.isFinite(Number(value)) && Number(value) > 1 ? Number(value).toFixed(2) : '—');
  const total = Number.isFinite(Number(odds.totalLine))
    ? `<span>O/U ${escapeHTML(Number(odds.totalLine).toFixed(1))} · ${fmt(odds.over)} / ${fmt(odds.under)}</span>` : '';
  return `<div class="source-prices" aria-label="Source prices"><span>1 · ${fmt(odds.home)}</span><span>X · ${fmt(odds.draw)}</span><span>2 · ${fmt(odds.away)}</span>${total}<em>${escapeHTML(odds.provider || 'Source')} via ESPN</em></div>`;
}

function probabilityMarkup(match) {
  const probabilities = match.probabilities;
  if (!probabilities) return '';
  const values = [Number(probabilities.home), Number(probabilities.draw), Number(probabilities.away)]
    .map((value) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 0);
  const labels = ['H', 'D', 'A'];
  const segments = values.map((value) => `<span class="probability-segment" style="width:${value}%"></span>`).join('');
  const text = values.map((value, index) => `<span>${labels[index]} <b>${value.toFixed(1)}%</b></span>`).join('');
  const model = match.model || {};
  const xg = model.expectedGoals && Number.isFinite(Number(model.expectedGoals.home))
    ? ` · xG ${Number(model.expectedGoals.home).toFixed(2)}–${Number(model.expectedGoals.away).toFixed(2)}` : '';
  const blended = model.inputs?.oddsBlended1x2 ? 'Blended 50/50 with de-vigged source prices.' : 'No source prices blended.';
  return `<div class="probability-block probability-model"><div class="probability-heading"><span>Model probabilities${escapeHTML(xg)}</span><strong>ALGORITHMIC · NOT VERIFIED</strong></div><div class="probability-bar" role="img" aria-label="Home ${values[0]} percent, draw ${values[1]} percent, away ${values[2]} percent">${segments}</div><div class="probability-values">${text}</div>${sourcePricesMarkup(match.odds)}<p class="model-note">${escapeHTML(model.source || 'Public results feed')} · checked ${escapeHTML(utcStamp(model.sourceCheckedAt))}. ${escapeHTML(blended)}</p></div>`;
}

function leagueSymbol(id) {
  if (id === 2) return '<i class="league-symbol symbol-ucl" aria-hidden="true">C</i>';
  if (id === 140) return '<i class="league-symbol symbol-laliga" aria-hidden="true">L</i>';
  return '<i class="league-symbol" aria-hidden="true">◆</i>';
}

function fixtureCard(match, index) {
  const status = intelStatus(match);
  const marketCells = fixtureMarkets(match.markets).map(marketMarkup).join('');
  const verified = match.evaluation?.verified === true;
  return `<article class="fixture-card" style="animation-delay:${Math.min(index * 35, 210)}ms">
    <div class="fixture-top">
      <span class="fixture-league">${leagueSymbol(match.league.id)}${escapeHTML(match.league.name)}</span>
      <span class="fixture-time">KO · ${escapeHTML(utcKickoff(match.kickoffUtc))}</span>
    </div>
    <div class="teams-row">
      <div class="team-lockup">${crestMarkup(match.home)}<span class="team-name">${escapeHTML(match.home.name)}</span></div>
      <span class="versus">VS</span>
      <div class="team-lockup away-lockup"><span class="team-name">${escapeHTML(match.away.name)}</span>${crestMarkup(match.away)}</div>
    </div>
    <div class="form-row">${formMarkup(match.form?.home, 'home')}<span class="form-label">FORM</span>${formMarkup(match.form?.away, 'away')}</div>
    <div class="fixture-status-row"><span class="status-pill status-${status.tone}"><i aria-hidden="true"></i>${escapeHTML(status.label)}</span><span class="picks-open">PICKS OPEN</span></div>
    <div class="prediction-title"><span>${verified ? 'VERIFIED FREE PICKS' : 'FREE MODEL PICKS'}</span><span>${escapeHTML(match.source?.provider || 'Public feed')} · ${escapeHTML(utcStamp(match.source?.checkedAt))}</span></div>
    <div class="market-grid">${marketCells}</div>
    ${probabilityMarkup(match)}
    ${evidenceMarkup(match.evidence)}
  </article>`;
}

function skeletonMarkup(count = 4) {
  return Array.from({ length: count }, () => '<div class="skeleton-card" aria-hidden="true"></div>').join('');
}

function leagueGapMarkup() {
  const league = leagueStatus.find((item) => String(item.id) === activeFilter);
  const name = league?.name || activeFilterLabel?.textContent || 'This league';
  if (league?.status === 'season_break') {
    return `<div class="empty-slate"><span class="empty-slate-label">SEASON BREAK</span><p class="empty-slate-copy">${escapeHTML(name)} has no fixture scheduled in the next 45 days in the source feed. Cards return automatically when the next round is published.</p></div>`;
  }
  return `<div class="empty-slate"><span class="empty-slate-label">FEED RECONNECTING</span><p class="empty-slate-copy">The public fixture feed for ${escapeHTML(activeFilter === 'all' ? 'these leagues' : name)} did not respond. Retrying automatically; no placeholder matches are shown.</p><button class="button button-outline button-small retry-feed" type="button">Retry now <span aria-hidden="true">↻</span></button></div>`;
}

function renderFixtures() {
  const visible = activeFilter === 'all' ? fixtures : fixtures.filter((match) => String(match.league.id) === activeFilter);
  if (visible.length) {
    const shown = visible.slice(0, visibleLimit);
    const more = visible.length - shown.length;
    fixtureGrid.innerHTML = shown.map(fixtureCard).join('')
      + (more > 0 ? `<div class="load-more-row"><button class="button button-outline button-small load-more" type="button">Show ${Math.min(more, PAGE_SIZE)} more match cards <span aria-hidden="true">↓</span></button></div>` : '');
  } else if (fixtureLoadPending) {
    fixtureGrid.innerHTML = skeletonMarkup(activeFilter === 'all' ? 4 : 2);
  } else {
    fixtureGrid.innerHTML = leagueGapMarkup();
  }
  fixtureGrid.setAttribute('aria-busy', String(fixtureLoadPending));
  fixtureCount.textContent = visible.length
    ? `Showing ${Math.min(visible.length, visibleLimit)} of ${visible.length} real fixtures · ${visible.length * 3} model picks`
    : fixtureLoadPending ? 'Loading real fixtures…' : 'Waiting for the next published fixtures';
  fixtureGrid.querySelectorAll('.club-crest').forEach((image) => {
    image.addEventListener('error', () => showCrestFallback(image), { once: true });
    if (image.complete && image.naturalWidth === 0) showCrestFallback(image);
  });
  fixtureGrid.querySelector('.load-more')?.addEventListener('click', () => {
    visibleLimit += PAGE_SIZE;
    renderFixtures();
  });
  fixtureGrid.querySelector('.retry-feed')?.addEventListener('click', () => loadFixtures());
}

function updateCounts() {
  const counts = {};
  fixtures.forEach((match) => {
    const leagueId = String(match.league?.id ?? '');
    if (leagueId) counts[leagueId] = (counts[leagueId] || 0) + 1;
  });
  document.querySelectorAll('[data-league-count]').forEach((element) => {
    element.textContent = String(counts[element.dataset.leagueCount] ?? 0).padStart(2, '0');
  });
  document.querySelectorAll('[data-filter-count]').forEach((element) => {
    const key = element.dataset.filterCount;
    const count = key === 'all' ? fixtures.length : Number(counts[key] ?? 0);
    element.textContent = String(count).padStart(2, '0');
  });
  return counts;
}

function scheduleRetry() {
  if (retryTimer || autoRetries >= MAX_AUTO_RETRIES) return;
  autoRetries += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    loadFixtures();
  }, 30000 * autoRetries);
}

async function loadFixtures() {
  fixtureLoadPending = true;
  fixtureGrid.setAttribute('aria-busy', 'true');
  if (!fixtures.length) {
    scheduleNotice.textContent = 'Loading real fixtures, club crests and model picks from public feeds…';
    renderFixtures();
  }
  try {
    const response = await fetch('/api/fixtures', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok && !Array.isArray(payload.fixtures)) throw new Error(payload.message || 'Fixture service unavailable.');
    const providerFixtures = (Array.isArray(payload.fixtures) ? payload.fixtures : []).filter(isCompleteFixture);
    if (!providerFixtures.length && fixtures.length) throw new Error('Keep the previous slate visible.');
    fixtures = providerFixtures;
    leagueStatus = Array.isArray(payload.leagues) ? payload.leagues : [];
    fixtureLoadPending = false;
    const counts = updateCounts();
    const leaguesCovered = Object.keys(counts).length;
    const priced = providerFixtures.filter((match) => match.odds?.available).length;
    document.querySelector('#brief-fixture-count').textContent = String(providerFixtures.length).padStart(2, '0');
    document.querySelector('#brief-pick-count').textContent = String(providerFixtures.length * 3).padStart(2, '0');
    document.querySelector('#brief-status-tag').textContent = providerFixtures.length ? 'LIVE FEED' : 'RECONNECTING';
    document.querySelector('#brief-foot-status').textContent = `${leaguesCovered}/23 leagues populated · refreshes every 30 min`;
    document.querySelector('#brief-updated').textContent = utcStamp(payload.refreshedAt);
    document.querySelector('#ribbon-caption').textContent = `${providerFixtures.length} real fixtures · ${providerFixtures.length * 3} model picks · ${priced} with source prices`;
    const feedStamp = document.querySelector('#fixture-feed-stamp');
    if (feedStamp) feedStamp.textContent = 'ESPN · LIVESCORE PUBLIC FEEDS';
    scheduleNotice.textContent = providerFixtures.length
      ? 'Real fixtures and club crests from public ESPN and LiveScore feeds. Every card shows a pick for all three markets. These are algorithmic model outputs, not verified tips. The 48h intel status appears on every card and never locks a pick.'
      : 'The public fixture feeds are reconnecting. Retrying automatically; no placeholder matches are shown.';
    scheduleNotice.classList.toggle('notice-blocked', providerFixtures.length === 0);
    if (providerFixtures.length && leagueStatus.some((league) => league.status === 'unavailable')) scheduleRetry();
    if (!providerFixtures.length) scheduleRetry();
    else autoRetries = 0;
    renderFixtures();
  } catch {
    fixtureLoadPending = false;
    if (!fixtures.length) {
      updateCounts();
      document.querySelector('#brief-fixture-count').textContent = '00';
      document.querySelector('#brief-pick-count').textContent = '00';
      document.querySelector('#brief-status-tag').textContent = 'RECONNECTING';
      document.querySelector('#brief-foot-status').textContent = 'Public fixture feeds reconnecting';
      document.querySelector('#ribbon-caption').textContent = 'Fixture feeds reconnecting · no placeholder matches are shown';
      scheduleNotice.textContent = 'The fixture service did not respond. Retrying automatically; no placeholder matches, picks or odds are shown.';
      scheduleNotice.classList.add('notice-blocked');
    }
    scheduleRetry();
    renderFixtures();
  }
}

function setActiveFilter(button) {
  activeFilter = button.dataset.filter;
  visibleLimit = PAGE_SIZE;
  filters.forEach((filterButton) => {
    const isActive = filterButton.dataset.filter === activeFilter;
    filterButton.classList.toggle('is-active', isActive);
    filterButton.setAttribute('aria-pressed', String(isActive));
  });
  if (activeFilterLabel) {
    activeFilterLabel.textContent = activeFilter === 'all'
      ? 'All leagues'
      : button.querySelector('.league-name')?.textContent.trim() || 'Selected league';
  }
  renderFixtures();
}

filters.forEach((button) => button.addEventListener('click', () => setActiveFilter(button)));

function normalizeLeagueQuery(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
}

if (leagueSearch) {
  leagueSearch.addEventListener('input', () => {
    const query = normalizeLeagueQuery(leagueSearch.value.trim());
    let visible = 0;
    filters.forEach((button) => {
      if (button.dataset.filter === 'all') return;
      const name = button.querySelector('.league-name')?.textContent || '';
      button.hidden = !normalizeLeagueQuery(name).includes(query);
      if (!button.hidden) visible += 1;
    });
    if (leagueSearchEmpty) leagueSearchEmpty.hidden = visible > 0;
    const activeButton = filters.find((button) => button.dataset.filter === activeFilter);
    if (activeButton?.hidden) {
      const allButton = filters.find((button) => button.dataset.filter === 'all');
      if (allButton) setActiveFilter(allButton);
    }
  });
}

function openMembership(plan = 'Monthly') {
  selectedPlanLabel.textContent = plan;
  dialogStatus.textContent = 'Joining routes are not configured. No payment, account or membership entitlement is active.';
  dialogStatus.classList.remove('is-selected');
  if (!vipDialog.open) vipDialog.showModal();
}

document.querySelectorAll('.join-trigger').forEach((button) => {
  button.addEventListener('click', () => openMembership(button.dataset.plan || 'Monthly'));
});

document.querySelectorAll('[data-story]').forEach((button) => {
  button.addEventListener('click', () => {
    const story = stories[button.dataset.story];
    if (!story) return;
    document.querySelector('#article-dialog-category').textContent = story.category;
    document.querySelector('#article-dialog-read-time').textContent = `${story.readTime} · EDITORIAL`;
    document.querySelector('#article-dialog-title').textContent = story.title;
    document.querySelector('#article-dialog-dek').textContent = story.dek;
    document.querySelector('#article-dialog-content').innerHTML = story.sections.map(([heading, paragraph]) =>
      `<section><h3>${escapeHTML(heading)}</h3><p>${escapeHTML(paragraph)}</p></section>`).join('');
    articleDialog.showModal();
  });
});

document.querySelectorAll('[data-close-article]').forEach((button) => button.addEventListener('click', () => articleDialog.close()));
articleDialog.addEventListener('click', (event) => { if (event.target === articleDialog) articleDialog.close(); });
document.querySelectorAll('[data-close-dialog]').forEach((button) => button.addEventListener('click', () => vipDialog.close()));
vipDialog.addEventListener('click', (event) => { if (event.target === vipDialog) vipDialog.close(); });
document.querySelectorAll('[data-channel]').forEach((button) => {
  button.addEventListener('click', () => {
    dialogStatus.textContent = `${button.dataset.channel} is not connected for the ${selectedPlanLabel.textContent} plan. No message or payment was sent.`;
    dialogStatus.classList.add('is-selected');
  });
});

const menuToggle = document.querySelector('.menu-toggle');
const primaryNav = document.querySelector('#primary-nav');
menuToggle.addEventListener('click', () => {
  const isOpen = menuToggle.getAttribute('aria-expanded') === 'true';
  menuToggle.setAttribute('aria-expanded', String(!isOpen));
  menuToggle.setAttribute('aria-label', isOpen ? 'Open navigation' : 'Close navigation');
  primaryNav.classList.toggle('is-open', !isOpen);
});
primaryNav.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => {
  menuToggle.setAttribute('aria-expanded', 'false');
  menuToggle.setAttribute('aria-label', 'Open navigation');
  primaryNav.classList.remove('is-open');
}));

document.querySelector('#copyright-year').textContent = String(new Date().getFullYear());
loadFixtures();
