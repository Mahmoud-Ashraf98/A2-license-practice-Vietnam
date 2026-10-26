/* Atomic, resumable offline content. RELEASE is set by scripts/package-content.py. */
const RELEASE = '36e432d7850fe9c5033e8a8b';
const CACHE_PREFIX = 'viet-road-content-';
const CACHE_NAME = CACHE_PREFIX + RELEASE;
const absolute = path => new URL(path, self.registration.scope).href;
const READY_KEY = absolute('__offline_ready__/' + RELEASE);
let runningPreparation;
let latestProgress = { done: 0, total: 0 };

async function announce(message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage(message);
}
async function isReady() {
  const cache = await caches.open(CACHE_NAME);
  return !!(await cache.match(READY_KEY));
}
async function digest(response) {
  const bytes = await response.arrayBuffer();
  const hashed = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashed), b => b.toString(16).padStart(2, '0')).join('');
}
async function verifiedResponse(cache, file) {
  const url = absolute(file.url);
  const stored = await cache.match(url);
  if (stored) {
    if (await digest(stored.clone()) === file.sha256) return;
    await cache.delete(url);
  }
  const response = await fetch(url, { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok || response.type === 'opaque') throw new Error(`Could not download ${file.url} (${response.status})`);
  if (await digest(response.clone()) !== file.sha256) throw new Error(`Content verification failed for ${file.url}`);
  await cache.put(url, response);
}
async function prepareContent() {
  if (runningPreparation) return runningPreparation;
  runningPreparation = (async () => {
    if (await isReady()) {
      const cache = await caches.open(CACHE_NAME);
      const marker = await (await cache.match(READY_KEY)).json();
      latestProgress = { done: marker.files, total: marker.files };
      await announce({ type: 'OFFLINE_READY', version: RELEASE, ...latestProgress });
      return true;
    }
    const manifestResponse = await fetch(absolute('offline-manifest.json'), { cache: 'no-store', credentials: 'same-origin' });
    if (!manifestResponse.ok) throw new Error('The offline content list could not be downloaded.');
    const manifest = await manifestResponse.json();
    if (manifest.version !== RELEASE || !Array.isArray(manifest.files) || !manifest.files.length) throw new Error('The app and offline content versions do not match. Reload when your mock is finished.');
    const seen = new Set();
    for (const file of manifest.files) {
      const url = new URL(file.url, self.registration.scope);
      if (typeof file.url !== 'string' || url.origin !== self.location.origin || !url.href.startsWith(self.registration.scope) || !/^[a-f0-9]{64}$/.test(file.sha256) || seen.has(url.href)) throw new Error('The offline content list is invalid.');
      seen.add(url.href);
    }
    const cache = await caches.open(CACHE_NAME);
    // A readiness marker is written only after every asset verifies successfully.
    await cache.delete(READY_KEY);
    latestProgress = { done: 0, total: manifest.files.length };
    await announce({ type: 'OFFLINE_PROGRESS', ...latestProgress });
    let cursor = 0, error = null;
    const download = async () => {
      while (cursor < manifest.files.length) {
        const file = manifest.files[cursor++];
        try {
          await verifiedResponse(cache, file);
          latestProgress.done++;
          await announce({ type: 'OFFLINE_PROGRESS', ...latestProgress });
        } catch (failure) { error ??= failure; }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, manifest.files.length) }, download));
    if (error) throw error;
    await cache.put(READY_KEY, new Response(JSON.stringify({ version: RELEASE, files: manifest.files.length }), { headers: { 'content-type': 'application/json' } }));
    await announce({ type: 'OFFLINE_READY', version: RELEASE, ...latestProgress });
    return true;
  })().catch(async error => {
    await announce({ type: 'OFFLINE_ERROR', message: error.message || 'Offline preparation is incomplete.', ...latestProgress });
    throw error;
  }).finally(() => { runningPreparation = null; });
  return runningPreparation;
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await prepareContent();
    // Updates wait for old tabs to close. Never interrupt an active mock.
    if (!self.registration.active) await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    if (!(await isReady())) throw new Error('Partial offline content cannot activate.');
    // Claiming is safe here: updates never skip an existing active worker.
    await self.clients.claim();
    await announce({ type: 'OFFLINE_READY', version: RELEASE, ...latestProgress });
    // Retain the previous completed release as a recovery copy, plus unfinished
    // stages so a failed download can resume rather than discarding useful files.
    const keys = (await caches.keys()).filter(key => key.startsWith(CACHE_PREFIX));
    const complete = [];
    for (const key of keys) {
      const c = await caches.open(key);
      const entries = await c.keys();
      if (entries.some(entry => entry.url.includes('/__offline_ready__/'))) complete.push(key);
    }
    for (const old of complete.slice(0, -2)) if (old !== CACHE_NAME) await caches.delete(old);
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type === 'CHECK_STATUS') {
    event.waitUntil((async () => {
      const message = { type: 'OFFLINE_STATUS', ready: await isReady(), version: RELEASE, ...latestProgress };
      if (event.ports?.[0]) event.ports[0].postMessage(message);
      else event.source?.postMessage(message);
    })());
  } else if (event.data?.type === 'RETRY_OFFLINE') {
    event.waitUntil((async () => {
      try {
        await prepareContent();
        if (!self.registration.active) await self.skipWaiting();
      } catch (_) { /* OFFLINE_ERROR already announces the actionable failure. */ }
    })());
  }
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith((async () => {
    if (await isReady()) {
      const cache = await caches.open(CACHE_NAME);
      const stored = await cache.match(event.request, { ignoreSearch: true });
      if (stored) return stored;
      if (event.request.mode === 'navigate') {
        const shell = await cache.match(absolute('index.html'));
        if (shell) return shell;
      }
    }
    return fetch(event.request);
  })());
});
