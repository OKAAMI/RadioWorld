import * as THREE from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createGlobe } from './globe.js';
import { createStarfield } from './stars.js';
import { fetchRandomStations, fetchRadiosByGenre, fetchRadiosByLanguage, fetchRadiosByCountry } from './api/radioService.js';
import { buildPins, clearPins, animatePins, stationAtMouse } from './pins.js';
import { initSearchPanel, updateStationCount, renderFavouritesChip } from './ui/searchPanel.js';
import { getFavourites, isFavourite, toggleFavourite } from './favourites.js';
import genresData from './api/genres.json';

// Sorted longest-first so greedy matching picks "Classic Rock" before "Classic" or "Rock".
const KNOWN_GENRES = (genresData.data ?? [])
  .map(g => g.name ?? g.slug)
  .filter(Boolean)
  .sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length);

function parseGenreText(text) {
  const result = [];
  let remaining = text.trim();
  while (remaining.length > 0) {
    let matched = false;
    for (const genre of KNOWN_GENRES) {
      if (remaining.toLowerCase().startsWith(genre.toLowerCase())) {
        result.push(genre);
        remaining = remaining.slice(genre.length).trimStart();
        matched = true;
        break;
      }
    }
    if (!matched) {
      const i = remaining.indexOf(' ');
      if (i === -1) { result.push(remaining); remaining = ''; }
      else { result.push(remaining.slice(0, i)); remaining = remaining.slice(i + 1).trimStart(); }
    }
  }
  return result;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const loadingEl    = document.getElementById('loading');
const panel        = document.getElementById('station-panel');
const logoImg      = document.getElementById('station-logo');
const logoFallback = document.getElementById('logo-fallback');
const nameEl       = document.getElementById('station-name');
const metaEl       = document.getElementById('station-meta');
const tagsEl       = document.getElementById('station-tags');
const favBtn       = document.getElementById('fav-btn');
const playBtn      = document.getElementById('play-btn');
const playStatus   = document.getElementById('play-status');
const playBitrate  = document.getElementById('play-bitrate');
const playerWave   = document.getElementById('player-wave');
const bandBadge    = document.getElementById('station-band');
const audioEl      = document.getElementById('station-audio');

// ── Audio player ──────────────────────────────────────────────────────────────
function setPlayerState(state) {
  const iconPlay = playBtn.querySelector('.icon-play');
  const iconStop = playBtn.querySelector('.icon-stop');

  if (state === 'playing') {
    iconPlay.style.display = 'none';
    iconStop.style.display = '';
    playBtn.classList.add('playing');
    playStatus.textContent = 'Streaming live';
    playerWave.classList.add('active');
  } else {
    iconPlay.style.display = '';
    iconStop.style.display = 'none';
    playBtn.classList.remove('playing');
    playerWave.classList.remove('active');
    if (state === 'buffering') playStatus.textContent = 'Buffering…';
    if (state === 'error')     playStatus.textContent = 'Stream unavailable';
    if (state === 'idle')      playStatus.textContent = 'Click to stream';
  }
}

audioEl.addEventListener('playing', () => { setPlayerState('playing'); playingStation = currentStation; });
audioEl.addEventListener('waiting', () => { if (!audioEl.paused) setPlayerState('buffering'); });
audioEl.addEventListener('pause',   () => { setPlayerState('idle');    playingStation = null; });
audioEl.addEventListener('error',   () => { setPlayerState('error');   playingStation = null; });

playBtn.addEventListener('click', () => {
  if (audioEl.paused || audioEl.ended) {
    audioEl.play().catch(() => setPlayerState('error'));
  } else {
    audioEl.pause();
    audioEl.src = '';
    setPlayerState('idle');
  }
});

// ── Station info panel ────────────────────────────────────────────────────────
function showStation(station) {
  logoFallback.classList.remove('visible');
  if (station.logo) {
    logoImg.src = station.logo;
    logoImg.style.display = 'block';
    logoImg.onerror = () => {
      logoImg.style.display = 'none';
      logoFallback.classList.add('visible');
    };
  } else {
    logoImg.style.display = 'none';
    logoFallback.classList.add('visible');
  }

  nameEl.textContent = station.name?.trim() || 'Unknown Station';

  const city     = station.location?.cityName;
  const country  = station.location?.countryName;
  const language = station.languages?.[0]?.name;
  metaEl.textContent = [city, country, language].filter(Boolean).join(' · ');

  tagsEl.innerHTML = '';
  const genreText = station.genre?.text;
  if (genreText) {
    parseGenreText(genreText).slice(0, 5).forEach(tag => {
      const chip = document.createElement('span');
      chip.className   = 'tag';
      chip.textContent = tag;
      tagsEl.appendChild(chip);
    });
  }

  const streams = station.streams ?? [];
  const stream  = streams.find(s => s.isHttps && s.works !== false)
               ?? streams.find(s => s.works !== false)
               ?? streams[0];

  audioEl.pause();
  audioEl.src = stream?.url ?? '';
  setPlayerState('idle');

  const bitrateParts = [
    stream?.bitrate ? `${stream.bitrate} kbps` : '',
    stream?.codec?.toUpperCase(),
  ].filter(Boolean);
  playBitrate.textContent = bitrateParts.join(' · ');

  const band = station.dial?.band;
  const dial = station.dial?.dial;
  const bandLabel = [band, dial].filter(Boolean).join(' ');
  bandBadge.textContent = bandLabel;
  bandBadge.classList.toggle('hidden', !bandLabel);

  const faved = isFavourite(station.id);
  favBtn.classList.toggle('active', faved);
  favBtn.innerHTML = faved ? '&#9829;' : '&#9825;';

  panel.classList.remove('hidden');
  currentStation = station;
}

document.getElementById('close-panel').addEventListener('click', () => {
  audioEl.pause();
  audioEl.src = '';
  setPlayerState('idle');
  panel.classList.add('hidden');
});

favBtn.addEventListener('click', () => {
  if (!currentStation) return;
  const added = toggleFavourite(currentStation);
  favBtn.classList.toggle('active', added);
  favBtn.innerHTML = added ? '&#9829;' : '&#9825;';
  renderFavouritesChip();
});

// ── Globe scene ───────────────────────────────────────────────────────────────
const mouse = new THREE.Vector2();
let scene          = null;
let pins           = [];
let currentStation = null;
let playingStation = null;

function loadStations(stations) {
  pins = clearPins(scene, pins);
  pins = buildPins(scene, stations);
  updateStationCount(pins.length);
}

async function init() {
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  await renderer.init();
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  scene  = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.01, 1000);
  camera.position.z = 2.5;

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping   = true;
  controls.dampingFactor   = 0.05;
  controls.minDistance     = 1.05;
  controls.maxDistance     = 8;
  controls.autoRotate      = false;

  scene.add(new THREE.AmbientLight(0x334466, 1.2));
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.8);
  sun.position.set(5, 3, 5);
  scene.add(sun);

  scene.add(createGlobe());
  scene.add(createStarfield());

  // Initial random stations
  const stations = await fetchRandomStations(100);
  loadStations(stations);
  console.log(`Loaded ${stations.length} stations · ${pins.length} with geo coordinates`);

  // Fade out loading screen
  loadingEl.classList.add('fade-out');
  setTimeout(() => { loadingEl.style.display = 'none'; }, 650);

  // Init search panel — genres + languages load in background
  initSearchPanel({
    onFilter: async ({ type, id }) => {
      if (type === 'favourites') {
        loadStations(getFavourites());
        return;
      }
      const stations = type === 'genre'
        ? await fetchRadiosByGenre(id)
        : type === 'country'
          ? await fetchRadiosByCountry(id)
          : await fetchRadiosByLanguage(id);
      loadStations(stations);
    },
    onReset: async () => {
      const stations = await fetchRandomStations(100);
      loadStations(stations);
    },
  });

  // ── Interactions ──────────────────────────────────────────────────────────
  const canvas = renderer.domElement;

  canvas.addEventListener('mousemove', (e) => {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    canvas.style.cursor = stationAtMouse(pins, mouse, camera) ? 'pointer' : 'default';
  });

  canvas.addEventListener('click', (e) => {
    mouse.x =  (e.clientX / window.innerWidth)  * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    const station = stationAtMouse(pins, mouse, camera);
    if (station) showStation(station);
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ── Render loop ───────────────────────────────────────────────────────────
  let t = 0;
  renderer.setAnimationLoop(() => {
    t += 0.016;
    controls.update();
    animatePins(pins, t, playingStation, camera.position.length());
    renderer.render(scene, camera);
  });
}

init().catch(err => {
  console.error('WebGPU init failed:', err);
  loadingEl.style.display = 'none';
  document.getElementById('webgpu-error').classList.add('visible');
});
