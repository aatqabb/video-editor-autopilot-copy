// YouTube Data API v3 key storage, shared by the "YouTube Research" tool.
// (The earlier AI Footage Finder panel that also lived in this file — local
// NLP concept matching, transcript-timestamp search, license/duration
// lookup — was removed by request; footage sourcing now goes through the
// Stock tab's licensed providers instead.)

const STORAGE_KEY = 'video-editor.youtube-api-key'

function readStoredKey() {
  try { return window.localStorage.getItem(STORAGE_KEY) || '' } catch { return '' }
}
function writeStoredKey(value) {
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, value)
    else window.localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage can be unavailable */ }
}

export function getYoutubeApiKey() { return readStoredKey() || import.meta.env.VITE_YOUTUBE_API_KEY || '' }
export function saveYoutubeApiKey(value) { writeStoredKey(String(value || '').trim()); return getYoutubeProviderStatus() }
export function clearYoutubeApiKey() { writeStoredKey(''); return getYoutubeProviderStatus() }
export function getYoutubeProviderStatus() { return { youtube: Boolean(getYoutubeApiKey()) } }
