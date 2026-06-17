import axios from 'axios';
import { RAPIDAPI_KEY, RAPIDAPI_HOST, API_BASE_URL } from '../config.js';

const headers = {
  'x-rapidapi-key': RAPIDAPI_KEY,
  'x-rapidapi-host': RAPIDAPI_HOST,
  'Content-Type': 'application/json',
};

function unwrap(data) {
  return data.success ? data.data : [];
}

export async function fetchRandomStations(limit = 100) {
  const { data } = await axios.get(`${API_BASE_URL}/radios/random`, {
    headers,
    params: { limit: String(limit) },
  });
  return unwrap(data);
}

export async function fetchGenres(limit = 200) {
  const { data } = await axios.get(`${API_BASE_URL}/genres`, {
    headers,
    params: { limit: String(limit), page: '1' },
  });
  return unwrap(data);
}

export async function fetchLanguages(limit = 200) {
  const { data } = await axios.get(`${API_BASE_URL}/languages`, {
    headers,
    params: { limit: String(limit), page: '1' },
  });
  return unwrap(data);
}

export async function fetchRadiosByGenre(genreId, limit = 150) {
  const { data } = await axios.get(`${API_BASE_URL}/genres/${genreId}/radios`, {
    headers,
    params: { limit: String(limit), page: '1' },
  });
  return unwrap(data);
}

export async function fetchRadiosByLanguage(langCode, limit = 150) {
  const { data } = await axios.get(`${API_BASE_URL}/languages/${langCode}/radios`, {
    headers,
    params: { limit: String(limit), page: '1' },
  });
  return unwrap(data);
}
