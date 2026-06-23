import languagesData  from '../api/languages.json';
import genresData     from '../api/genres.json';
import countriesData  from '../api/countries.json';
import { getFavourites } from '../favourites.js';

let activeChip  = null;
let isLoading   = false;
let onFilterCb  = null;
let onResetCb   = null;

const genreListEl    = () => document.getElementById('genre-list');
const langListEl     = () => document.getElementById('language-list');
const countryListEl  = () => document.getElementById('country-list');
const favListEl      = () => document.getElementById('favourites-list');
const resetBtn       = () => document.getElementById('reset-filter');
const countEl        = () => document.getElementById('station-count');
const filterLabelEl  = () => document.getElementById('active-filter-label');

export async function initSearchPanel({ onFilter, onReset }) {
  onFilterCb = onFilter;
  onResetCb  = onReset;

  resetBtn().addEventListener('click', resetFilter);

  // Genres, languages, and countries loaded from local JSON snapshots — no network requests
  const genres    = genresData.data    ?? [];
  const languages = languagesData.data ?? [];
  const countries = countriesData.data ?? [];

  renderChips(genreListEl(),   genres,    g => ({ id: g.id,   label: g.name ?? g.text ?? g.slug, type: 'genre'    }));
  renderChips(countryListEl(), countries, c => ({ id: c.name, label: c.name,                     type: 'country'  }));
  renderChips(langListEl(),    languages, l => ({ id: l.code, label: l.name,                     type: 'language' }));

  renderFavouritesChip();

  initChipSearch(
    genres.map(g => ({ id: g.id,   label: g.name ?? g.text ?? g.slug })),
    'genre-search', 'genre-autocomplete', genreListEl
  );
  initChipSearch(
    countries.map(c => ({ id: c.name, label: c.name })),
    'country-search', 'country-autocomplete', countryListEl
  );
  initChipSearch(
    languages.map(l => ({ id: l.code, label: l.name })),
    'language-search', 'language-autocomplete', langListEl
  );
}

function initChipSearch(items, inputId, dropdownId, listElFn) {
  const input    = document.getElementById(inputId);
  const dropdown = document.getElementById(dropdownId);
  let highlighted = -1;
  let lastItems   = [];

  function showDropdown(matches) {
    dropdown.innerHTML = '';
    highlighted = -1;
    if (!matches.length) { dropdown.classList.add('hidden'); return; }
    matches.slice(0, 8).forEach(item => {
      const li = document.createElement('li');
      li.className = 'chip-autocomplete-item';
      li.textContent = item.label;
      li.addEventListener('mousedown', e => { e.preventDefault(); selectSuggestion(item); });
      dropdown.appendChild(li);
    });
    dropdown.classList.remove('hidden');
  }

  function hideDropdown() {
    dropdown.classList.add('hidden');
    highlighted = -1;
  }

  function selectSuggestion(item) {
    input.value = '';
    hideDropdown();
    const chip = listElFn().querySelector(`[data-id="${item.id}"]`);
    if (chip) handleChipClick(chip);
  }

  function updateHighlight() {
    dropdown.querySelectorAll('li').forEach((li, i) =>
      li.classList.toggle('highlighted', i === highlighted)
    );
    if (highlighted >= 0 && lastItems[highlighted]) {
      input.value = lastItems[highlighted].label;
    }
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { hideDropdown(); return; }
    lastItems = items
      .filter(it => it.label && it.label.toLowerCase().includes(q))
      .sort((a, b) => {
        const ai = a.label.toLowerCase().indexOf(q);
        const bi = b.label.toLowerCase().indexOf(q);
        return ai - bi || a.label.localeCompare(b.label);
      });
    showDropdown(lastItems);
  });

  input.addEventListener('keydown', e => {
    if (dropdown.classList.contains('hidden')) return;
    const count = Math.min(lastItems.length, 8);
    if (e.key === 'ArrowDown')  { e.preventDefault(); highlighted = (highlighted + 1) % count; updateHighlight(); }
    else if (e.key === 'ArrowUp')   { e.preventDefault(); highlighted = (highlighted - 1 + count) % count; updateHighlight(); }
    else if (e.key === 'Enter')     { e.preventDefault(); const idx = highlighted >= 0 ? highlighted : 0; if (lastItems[idx]) selectSuggestion(lastItems[idx]); }
    else if (e.key === 'Escape')    { input.value = ''; hideDropdown(); }
  });

  input.addEventListener('blur', () => hideDropdown());
}

export function renderFavouritesChip() {
  const container = favListEl();
  if (!container) return;
  container.innerHTML = '';

  const favs = getFavourites();
  if (!favs.length) {
    container.innerHTML = '<span class="chips-empty">No favourites saved yet</span>';
    return;
  }

  const btn = document.createElement('button');
  btn.className      = 'filter-chip fav-filter-chip';
  btn.textContent    = `♥  ${favs.length} saved`;
  btn.dataset.type   = 'favourites';
  btn.dataset.id     = 'all';
  btn.dataset.label  = 'Favourites';
  btn.addEventListener('click', () => handleChipClick(btn));
  container.appendChild(btn);
}

function renderChips(container, items, toChipData) {
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = '<span class="chips-empty">None available</span>';
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const { id, label, type } = toChipData(item);
    if (!label) continue;

    const btn = document.createElement('button');
    btn.className        = 'filter-chip';
    btn.textContent      = label;
    btn.dataset.type     = type;
    btn.dataset.id       = String(id);
    btn.dataset.label    = label;
    btn.addEventListener('click', () => handleChipClick(btn));
    fragment.appendChild(btn);
  }
  container.appendChild(fragment);
}

async function handleChipClick(chip) {
  if (isLoading) return;

  // Toggle off if already active
  if (activeChip === chip) {
    resetFilter();
    return;
  }

  if (activeChip) activeChip.classList.remove('active');
  activeChip = chip;
  chip.classList.add('active');

  resetBtn().classList.remove('hidden');
  filterLabelEl().textContent = chip.dataset.label;
  filterLabelEl().parentElement.classList.remove('hidden');

  isLoading = true;
  setLoadingState(true);
  await onFilterCb?.({ type: chip.dataset.type, id: chip.dataset.id, label: chip.dataset.label });
  setLoadingState(false);
  isLoading = false;
}

async function resetFilter() {
  if (activeChip) {
    activeChip.classList.remove('active');
    activeChip = null;
  }
  resetBtn().classList.add('hidden');
  filterLabelEl().parentElement.classList.add('hidden');
  ['genre-search', 'country-search', 'language-search'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  isLoading = true;
  setLoadingState(true);
  await onResetCb?.();
  setLoadingState(false);
  isLoading = false;
}

function setLoadingState(on) {
  document.getElementById('panel-spinner').classList.toggle('hidden', !on);
  document.querySelectorAll('.filter-chip').forEach(c => {
    c.style.pointerEvents = on ? 'none' : '';
  });
}

export function updateStationCount(n) {
  countEl().textContent = `${n} station${n !== 1 ? 's' : ''} on map`;
}
