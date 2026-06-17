import languagesData from '../api/languages.json';
import genresData    from '../api/genres.json';

let activeChip  = null;
let isLoading   = false;
let onFilterCb  = null;
let onResetCb   = null;

const genreListEl    = () => document.getElementById('genre-list');
const langListEl     = () => document.getElementById('language-list');
const resetBtn       = () => document.getElementById('reset-filter');
const countEl        = () => document.getElementById('station-count');
const filterLabelEl  = () => document.getElementById('active-filter-label');

export async function initSearchPanel({ onFilter, onReset }) {
  onFilterCb = onFilter;
  onResetCb  = onReset;

  resetBtn().addEventListener('click', resetFilter);

  // Both genres and languages loaded from local JSON snapshots — no network requests
  const genres    = genresData.data    ?? [];
  const languages = languagesData.data ?? [];

  renderChips(genreListEl(), genres,    g => ({ id: g.id,   label: g.name ?? g.text ?? g.slug, type: 'genre'    }));
  renderChips(langListEl(),  languages, l => ({ id: l.code, label: l.name,                     type: 'language' }));
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
