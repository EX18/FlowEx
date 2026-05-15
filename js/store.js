const DB_NAME = 'flowex-data';
const STORE_NAME = 'app-state';

const openDb = () => new Promise((resolve, reject) => {
  if (!('indexedDB' in window)) return resolve(null);
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME);
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const idbGet = async (key) => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const idbSet = async (key, value) => {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
};

const createStore = (initialState) => {
  const state = { ...initialState };
  const listeners = new Set();
  let pendingSave = null;

  const notify = () => listeners.forEach((listener) => listener(state));

  const get = () => ({ ...state });
  const set = (patch) => {
    Object.assign(state, patch);
    notify();
    if (pendingSave) clearTimeout(pendingSave);
    pendingSave = setTimeout(() => idbSet('flowex-state', state), 300);
  };
  const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };
  const load = async () => {
    const persisted = await idbGet('flowex-state');
    if (persisted) {
      Object.assign(state, persisted);
    }
    notify();
    return get();
  };

  return { get, set, subscribe, load };
};

export { createStore, idbGet, idbSet };
