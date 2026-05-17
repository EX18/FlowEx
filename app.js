import {
    initializeApp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getFirestore,
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    serverTimestamp,
    collection,
    getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ── Firebase config ────────────────────────────
const firebaseConfig = {
    apiKey: "AIzaSyBjU04ggwkWLrM5-ZS9167ixsPY9agv_kg",
    authDomain: "flowex-app-cf0ae.firebaseapp.com",
    projectId: "flowex-app-cf0ae",
    storageBucket: "flowex-app-cf0ae.firebasestorage.app",
    messagingSenderId: "317866469877",
    appId: "1:317866469877:web:c6075e8f5ddd1fe36458bc"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// ── Creator config ─────────────────────────────
const CREATOR_USERNAME = 'nulvec';
const isCreator = () => CUR_USER === CREATOR_USERNAME;

// ── Utilities ───────────────────────────────────
const uid = () => window.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const dateLabel = iso => {
    const d = new Date(iso + 'T12:00:00');
    const m = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${d.getDate()} ${m[d.getMonth()]} ${d.getFullYear()}`;
};
const hashPIN = async pin => {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin + 'flowex_salt'));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// ── Default habits ──────────────────────────────
const mkHabit = (name, emoji, area, goal) => ({
    id: uid(),
    name,
    emoji,
    area,
    goal,
    freq: 'daily',
    logs: {},
    created: today()
});
const DEFAULT_HABITS = [
    mkHabit('Ejercicio / Gym', '🏋️', 'salud', '30 minutos mínimo de actividad'),
    mkHabit('Tomar agua', '💧', 'salud', '2 litros al día — 8 vasos'),
    mkHabit('Dormir 8 horas', '😴', 'salud', 'Acostarme antes de las 11pm'),
    mkHabit('Leer', '📚', 'mente', '20 páginas por día'),
    mkHabit('Meditar', '🧘', 'mente', '10 minutos de meditación diaria'),
    mkHabit('Dieta saludable', '🥗', 'nutricion', 'Comer real, evitar procesados'),
    mkHabit('Sin azúcar', '🚫', 'nutricion', 'Sin dulces ni refrescos'),
    mkHabit('Caminar', '🚶', 'salud', '10,000 pasos diarios'),
    mkHabit('Vitaminas', '💊', 'salud', 'Tomar suplementos del día'),
    mkHabit('Journaling', '✍️', 'mente', '5 min escribiendo reflexiones'),
    mkHabit('Sin pantallas al dormir', '📵', 'personal', 'No celular 1h antes de dormir'),
    mkHabit('Estiramiento', '🤸', 'salud', '15 minutos de flexibilidad'),
];

// ── State ───────────────────────────────────────
let CUR_USER = null; // current username
let S = { // local mirror of Firestore doc
    name: '',
    theme: '',
    xp: 0,
    level: 1,
    habits: [],
    notes: [],
    noteFolders: ['General', 'Ideas', 'Trabajo', 'Personal'],
    curHF: 'todos',
    tasks: [],
};
let unsubSnapshot = null; // live listener cleanup
let syncTimer = null;
let isDirty = false;

// ── PIN state ───────────────────────────────────
let loginPin = '',
    regPin = '';

// ── Local cache ─────────────────────────────────
const LC_KEY = 'flowex_session';

// Notify service worker to update cache
const notifyServiceWorkerOfUpdate = async () => {
    if (!navigator.serviceWorker?.controller) return;
    try {
        navigator.serviceWorker.controller.postMessage({
            type: 'UPDATE_CACHE',
            payload: {
                timestamp: Date.now(),
                user: CUR_USER,
                data: S
            }
        });
    } catch (e) {
        console.warn('SW notification failed:', e);
    }
};

// Invalidate server cache by fetching with cache-bust parameter
const invalidateServerCache = async () => {
    try {
        // Fetch main files with no-cache headers to invalidate server cache
        const files = ['./', './index.html', './manifest.json', './app.js'];
        const timestamp = Date.now();
        
        for (const file of files) {
            const url = new URL(file, window.location.origin);
            url.searchParams.set('cache_bust', timestamp);
            
            const request = new Request(url.toString(), {
                method: 'HEAD',
                headers: {
                    'Cache-Control': 'no-cache, max-age=0, must-revalidate',
                    'Pragma': 'no-cache'
                },
                cache: 'no-store'
            });
            
            try {
                await fetch(request);
            } catch (e) {
                // Silently fail, not critical
            }
        }
    } catch (e) {
        console.warn('Server cache invalidation attempt:', e);
    }
};

// Update service worker cache with current state
const updateCacheState = async () => {
    if (!navigator.serviceWorker?.controller) return;
    try {
        const cache = await caches.open('flowex-v2.2');
        const stateData = {
            timestamp: Date.now(),
            user: CUR_USER,
            data: S
        };
        const response = new Response(JSON.stringify(stateData), {
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            }
        });
        await cache.put(new Request('./__flowex-state__'), response);
        // Also notify the service worker and invalidate server cache
        notifyServiceWorkerOfUpdate();
        invalidateServerCache();
    } catch (e) {
        console.warn('Cache state update failed:', e);
    }
};

// Update IndexedDB cache
const updateIDBCache = async () => {
    try {
        await idbSet('flowex-cache', {
            timestamp: Date.now(),
            user: CUR_USER,
            data: S
        });
    } catch (e) {
        console.warn('IDB cache update failed:', e);
    }
};

const saveSession = () => {
    try {
        localStorage.setItem(LC_KEY, JSON.stringify({
            user: CUR_USER,
            data: S
        }));
        // Update all caches
        updateCacheState();
        updateIDBCache();
    } catch (e) {}
};
const loadSession = () => {
    try {
        const r = localStorage.getItem(LC_KEY);
        if (r) return JSON.parse(r);
    } catch (e) {}
    return null;
};
const clearSession = () => {
    localStorage.removeItem(LC_KEY);
    try {
        caches.delete('flowex-v2.2');
        idbSet('flowex-cache', null);
        invalidateServerCache();
    } catch (e) {}
};

// Hard reset - eliminates ALL cache
window.clearAllCache = async () => {
    console.warn('🧹 Clearing ALL cache...');
    try {
        // 1. Clear localStorage and sessionStorage
        try { localStorage.clear(); } catch (e) {}
        try { sessionStorage.clear(); } catch (e) {}
        
        // 2. Clear all service worker caches
        if ('caches' in window) {
            try {
                const cacheNames = await caches.keys();
                for (const name of cacheNames) {
                    await caches.delete(name);
                }
            } catch (e) {
                console.error('Cache deletion error:', e);
            }
        }
        
        // 3. Clear IndexedDB
        if ('indexedDB' in window) {
            try {
                const dbs = await indexedDB.databases();
                for (const db of dbs) {
                    try {
                        indexedDB.deleteDatabase(db.name);
                    } catch (e) {}
                }
            } catch (e) {
                console.error('IndexedDB deletion error:', e);
            }
        }
        
        // 4. Unregister service workers
        if ('serviceWorker' in navigator) {
            try {
                const registrations = await navigator.serviceWorker.getRegistrations();
                for (const reg of registrations) {
                    await reg.unregister();
                }
            } catch (e) {
                console.error('SW unregister error:', e);
            }
        }
        
        console.log('✅ All cache cleared. Reloading...');
        // Reload after delay
        setTimeout(() => {
            window.location.href = './';
        }, 1000);
    } catch (e) {
        console.error('Error clearing cache:', e);
        window.location.href = './';
    }
};

const IDB_NAME = 'flowex-db';
const IDB_STORE = 'keyval';

const openIDB = () => new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
        resolve(null);
        return;
    }
    const request = indexedDB.open(IDB_NAME, 1);
    request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
            db.createObjectStore(IDB_STORE);
        }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
});

const idbGet = async (key) => {
    const db = await openIDB();
    if (!db) {
        const raw = localStorage.getItem(`flowex_${key}`);
        return raw ? JSON.parse(raw) : null;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const store = tx.objectStore(IDB_STORE);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const idbSet = async (key, value) => {
    const db = await openIDB();
    if (!db) {
        localStorage.setItem(`flowex_${key}`, JSON.stringify(value));
        return value;
    }
    return new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        const store = tx.objectStore(IDB_STORE);
        const req = store.put(value, key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
};

const idb = {
    get: idbGet,
    set: idbSet
};
window.idb = idb;

// ── Firestore helpers ────────────────────────────
const userRef = username => doc(db, 'users', username);

const pushToFirestore = async (data) => {
    if (!CUR_USER) return;
    setSyncStatus('syncing');
    try {
        await setDoc(userRef(CUR_USER), {
            ...data,
            updatedAt: serverTimestamp()
        }, {
            merge: true
        });
        setSyncStatus('synced');
        saveSession();
    } catch (e) {
        console.warn('Sync error:', e);
        setSyncStatus('error');
        throw e;
    }
};

// Debounced save
const scheduleSave = () => {
    isDirty = true;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(async () => {
        if (!isDirty) return;
        try {
            // Update cache immediately
            saveSession();
            updateCacheState();
            updateIDBCache();
            // Then sync to Firestore
            await pushToFirestore(S);
            isDirty = false;
        } catch (e) {
            // Keep dirty flag so we can retry later
        }
    }, 1500);
};

const setSyncStatus = (status) => {
    const dot = document.getElementById('sync-dot');
    const lbl = document.getElementById('sync-label');
    if (!dot || !lbl) return;
    dot.className = 'sync-dot ' + status;
    lbl.textContent = status === 'syncing' ? 'Guardando...' : status === 'error' ? 'Sin conexión' : 'Sincronizado';
};

// ── Start realtime listener ──────────────────────
const startListener = (username) => {
    if (unsubSnapshot) unsubSnapshot();
    unsubSnapshot = onSnapshot(userRef(username), snap => {
        if (snap.exists()) {
            const remote = snap.data();
            // Merge remote into local S (remote wins, but don't lose local unsaved changes)
            S = {
                ...S,
                ...remote
            };
            delete S.updatedAt;
            delete S.pinHash;
            saveSession();
            renderAll();
        }
    }, err => {
        console.warn('Listener error:', err);
        setSyncStatus('error');
    });
};

// ── AUTH ─────────────────────────────────────────

// PIN keypad
window.pinKey = (form, digit) => {
    if (form === 'login') {
        if (loginPin.length >= 4) return;
        loginPin += digit;
        updatePinDisplay('login', loginPin);
        if (loginPin.length === 4) {
            /* ready */ }
    } else {
        if (regPin.length >= 4) return;
        regPin += digit;
        updatePinDisplay('reg', regPin);
    }
};
window.pinDel = (form) => {
    if (form === 'login') {
        loginPin = loginPin.slice(0, -1);
        updatePinDisplay('login', loginPin);
    } else {
        regPin = regPin.slice(0, -1);
        updatePinDisplay('reg', regPin);
    }
};
const updatePinDisplay = (form, pin) => {
    for (let i = 0; i < 4; i++) {
        const dot = document.getElementById((form === 'login' ? 'lpd' : 'rpd') + i);
        if (dot) dot.classList.toggle('filled', i < pin.length);
    }
};

window.switchAuthTab = (tab) => {
    document.getElementById('form-login').style.display = tab === 'login' ? 'flex' : 'none';
    document.getElementById('form-register').style.display = tab === 'register' ? 'flex' : 'none';
    document.getElementById('tab-login').classList.toggle('active', tab === 'login');
    document.getElementById('tab-register').classList.toggle('active', tab === 'register');
    loginPin = '';
    regPin = '';
    updatePinDisplay('login', '');
    updatePinDisplay('reg', '');
};

// Username availability check
let unameTimer = null;
let unameOk = false;
window.checkUsername = async () => {
    const val = document.getElementById('reg-user').value.trim().toLowerCase();
    const check = document.getElementById('uname-check');
    const hint = document.getElementById('uname-hint');
    unameOk = false;
    if (val.length < 3) {
        check.textContent = '';
        hint.textContent = 'Mínimo 3 caracteres.';
        return;
    }
    check.textContent = '⏳';
    clearTimeout(unameTimer);
    unameTimer = setTimeout(async () => {
        try {
            const snap = await getDoc(userRef(val));
            if (snap.exists()) {
                check.textContent = '❌';
                hint.textContent = `"${val}" ya está en uso. Probá con otro.`;
                hint.style.color = 'var(--a2)';
                unameOk = false;
            } else {
                check.textContent = '✅';
                hint.textContent = `"${val}" está disponible!`;
                hint.style.color = 'var(--a3)';
                unameOk = true;
            }
        } catch (e) {
            check.textContent = '⚠️';
            hint.textContent = 'Error de conexión.';
        }
    }, 500);
};

window.doLogin = async () => {
    const username = document.getElementById('login-user').value.trim().toLowerCase();
    const err = document.getElementById('login-err');
    const btn = document.getElementById('login-btn');
    if (!username) {
        err.textContent = 'Escribí tu nombre de usuario.';
        return;
    }
    if (loginPin.length < 4) {
        err.textContent = 'Ingresá tu PIN de 4 dígitos.';
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Verificando...';
    err.textContent = '';
    try {
        const snap = await getDoc(userRef(username));
        if (!snap.exists()) {
            err.textContent = 'Usuario no encontrado.';
            btn.disabled = false;
            btn.textContent = 'Entrar →';
            return;
        }
        const data = snap.data();
        
        // Validar PIN: primero tempPin, luego pinHash, luego pin plano
        let pinValid = false;

        // 1. Verificar PIN temporal
        if (data.tempPin && typeof data.tempPin === 'object') {
            const isUsed      = data.tempPin.used === true;
            const expiry      = Number(data.tempPin.expiry || 0);
            const notExpired  = expiry === 0 || Date.now() <= expiry;
            const storedCode  = String(data.tempPin.code || '').trim();
            const enteredCode = String(loginPin || '').trim();

            if (!isUsed && notExpired && storedCode === enteredCode) {
                pinValid = true;
                // Marcar como usado
                try {
                    await setDoc(userRef(username), {
                        tempPin: {
                            code:      data.tempPin.code,
                            expiry:    data.tempPin.expiry,
                            used:      true,
                            createdAt: data.tempPin.createdAt || null
                        }
                    }, { merge: true });
                } catch (e) {
                    console.error('Error marcando tempPin como usado:', e);
                }
            }
        }

        // 2. PIN hasheado (registro desde la app)
        if (!pinValid && data.pinHash) {
            const hash = await hashPIN(loginPin);
            if (data.pinHash === hash) pinValid = true;
        }

        // 3. PIN plano (usuarios creados por admin)
        if (!pinValid && data.pin) {
            if (String(data.pin).trim() === String(loginPin).trim()) pinValid = true;
        }

        if (!pinValid) {
            err.textContent = 'PIN incorrecto.';
            loginPin = '';
            updatePinDisplay('login', '');
            btn.disabled = false;
            btn.textContent = 'Entrar →';
            return;
        }
        // Success
        CUR_USER = username;
        S = {
            ...S,
            ...data
        };
        delete S.pinHash;
        delete S.tempPin;
        delete S.updatedAt;
        saveSession();
        startApp();
    } catch (e) {
        err.textContent = 'Error de conexión. Intentá de nuevo.';
        btn.disabled = false;
        btn.textContent = 'Entrar →';
    }
};

window.doRegister = async () => {
    const username = document.getElementById('reg-user').value.trim().toLowerCase();
    const name = document.getElementById('reg-name').value.trim();
    const err = document.getElementById('reg-err');
    const btn = document.getElementById('reg-btn');
    if (username.length < 3) {
        err.textContent = 'El usuario debe tener al menos 3 caracteres.';
        return;
    }
    if (!unameOk) {
        err.textContent = 'Verificá que el usuario esté disponible.';
        return;
    }
    if (!name) {
        err.textContent = 'Escribí tu nombre para mostrar.';
        return;
    }
    if (regPin.length < 4) {
        err.textContent = 'Creá un PIN de 4 dígitos.';
        return;
    }
    btn.disabled = true;
    btn.textContent = 'Creando cuenta...';
    err.textContent = '';
    try {
        // Double-check availability (race condition)
        const snap = await getDoc(userRef(username));
        if (snap.exists()) {
            err.textContent = 'Ese usuario ya fue tomado. Elegí otro.';
            btn.disabled = false;
            btn.textContent = 'Crear cuenta →';
            return;
        }
        const hash = await hashPIN(regPin);
        const newData = {
            username,
            name,
            theme: '',
            xp: 0,
            level: 1,
            habits: DEFAULT_HABITS,
            notes: [],
            pinHash: hash,
            createdAt: serverTimestamp(),
        };
        await setDoc(userRef(username), newData);
        CUR_USER = username;
        S = {
            ...newData
        };
        delete S.pinHash;
        saveSession();
        startApp();
    } catch (e) {
        err.textContent = 'Error al crear cuenta. Intentá de nuevo.';
        btn.disabled = false;
        btn.textContent = 'Crear cuenta →';
    }
};

// ── APP START ─────────────────────────────────────
const startApp = () => {
    document.getElementById('screen-auth').classList.remove('active');
    document.getElementById('screen-auth').style.display = 'none';
    document.getElementById('screen-app').classList.add('active');
    document.getElementById('screen-app').style.display = 'flex';
    document.body.className = S.theme || '';
    // Show admin nav tab if creator
    const adminTab = document.getElementById('tab-admin');
    if (adminTab) adminTab.style.display = isCreator() ? 'flex' : 'none';
    startListener(CUR_USER);
    initApp();
};

const initApp = () => {
    document.getElementById('gr-nm').textContent = S.name || CUR_USER || 'amigo';
    // Creator badge in topnav
    const existBadge = document.getElementById('creator-topbadge');
    if (existBadge) existBadge.remove();
    if (isCreator()) {
        const logo = document.querySelector('.logo');
        if (logo) {
            const badge = document.createElement('span');
            badge.id = 'creator-topbadge';
            badge.className = 'creator-badge';
            badge.style.marginLeft = '10px';
            badge.innerHTML = '<span class="creator-crown">👑</span> CREADOR';
            logo.parentNode.insertBefore(badge, logo.nextSibling);
        }
    }

    // Mover navegación y FAB a raíz de pantalla para no depender de un solo page
    const appShell = document.getElementById('screen-app');
    const bottomNav = document.querySelector('.bnav');
    if (appShell && bottomNav && bottomNav.parentElement && bottomNav.parentElement !== appShell) {
        appShell.appendChild(bottomNav);
    }
    const fab = document.querySelector('.fab');
    if (appShell && fab && fab.parentElement && fab.parentElement !== appShell) {
        appShell.appendChild(fab);
    }

    updateNotifIcon();

    // Agregar ejemplos para nuevos usuarios
    if (!S.books || S.books.length === 0) {
        S.books = [{
                id: uid(),
                title: 'Atomic Habits',
                author: 'James Clear',
                emoji: '📗',
                coverColor: '#7c6dfa',
                pages: 320,
                curPage: 50,
                status: 'leyendo',
                genre: 'Desarrollo personal',
                review: 'Libro excelente sobre hábitos.',
                sessions: [],
                rating: 0,
                addedAt: today()
            },
            {
                id: uid(),
                title: 'Sapiens',
                author: 'Yuval Noah Harari',
                emoji: '📚',
                coverColor: '#6dfac4',
                pages: 400,
                curPage: 0,
                status: 'backlog',
                genre: 'Historia',
                review: '',
                sessions: [],
                rating: 0,
                addedAt: today()
            }
        ];
    }
    if (!S.notifSettings) {
        S.notifSettings = {
            enabled: false,
            habits: {},
            dailySummary: '21:00',
            remindUnmarked: true
        };
    }
    if (S.notifSettings.enabled && Notification.permission !== 'granted') {
        S.notifSettings.enabled = false;
    }
    scheduleNotifications();
    if (!S.notes || S.notes.length === 0) {
        S.notes = [{
            id: uid(),
            title: 'Bienvenido a Notas',
            body: 'Esta es una nota de ejemplo. Podés editarla o eliminarla.\n\n**Markdown soportado**: # Título, - Lista, etc.',
            folder: 'General',
            tags: ['ejemplo'],
            color: 0,
            pinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }];
    }

    // Initialize new modules
    if (!S.sleep) S.sleep = [];
    if (!S.goals) S.goals = [];
    if (!S.events) S.events = [];
    if (!S.water) S.water = {
        today: 0,
        goal: 8,
        logs: []
    };
    if (!S.meals) S.meals = [];
    if (!S.moods) S.moods = [];
    if (!S.pom) S.pom = {
        sessions: [],
        config: {
            work: 25,
            short: 5,
            long: 15
        },
        today: 0
    };
    if (!S.finance) S.finance = {
        transactions: [],
        budget: {},
        currency: 'USD'
    };
    if (!S.calGoal) S.calGoal = 2000;

    updateGreeting();
    renderAll();
    // Hide FAB initially (dashboard active)
    document.querySelector('.fab').style.display = 'none';
    renderSettings();

    // Initialize Smart Notifications and Community (lazy load)
    setTimeout(() => {
        // Add sample community data if empty
        if (!S.communityInitialized) {
            S.communityInitialized = true;
            scheduleSave();
        }
        // Initialize updates manager for notifications
        initUpdates().then(() => {
            // Show important announcements
            if (updatesManager && updatesManager.announcements.length > 0) {
                const importantAnnouncements = updatesManager.announcements.filter(a => a.important && !a.read).slice(0, 1);
                if (importantAnnouncements.length > 0) {
                    const announcement = importantAnnouncements[0];
                    setTimeout(() => {
                        showUpdateBanner(announcement.title, announcement.message, announcement.actionLink, announcement.action);
                    }, 500);
                }
            }
        });
    }, 1000);
};

const renderAll = () => {
    renderDashboard();
    const p = document.querySelector('.page.active');
    const pid = p ? p.id.replace('page-', '') : '';
    if (pid === 'habitos') renderHabitos();
    if (pid === 'tareas') renderTasks();
    if (pid === 'notas') renderNotas();
    if (pid === 'lectura') renderLectura();
    if (pid === 'notifs') renderNotifs();
    if (pid === 'logros') renderLogros();
    if (pid === 'stats') renderStats();
    if (pid === 'metas') renderMetas();
    if (pid === 'calendario') renderCalendario();
    if (pid === 'pomodoro') renderPomodoro();
};

// ── NAVIGATION ────────────────────────────────────
window.gp = (page) => {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nt').forEach(t => t.classList.remove('active'));
    const pg = document.getElementById('page-' + page);
    if (pg) pg.classList.add('active');
    const tb = document.getElementById('tab-' + page);
    if (tb) tb.classList.add('active');
    if (page === 'dashboard') renderDashboard();
    if (page === 'habitos') renderHabitos();
    if (page === 'tareas') renderTasks();
    if (page === 'notas') renderNotas();
    if (page === 'lectura') renderLectura();
    if (page === 'notifs') renderNotifs();
    if (page === 'logros') renderLogros();
    if (page === 'stats') renderStats();
    if (page === 'ajustes') renderSettings();
    if (page === 'todolist') initTodoList();
    if (page === 'metas') renderMetas();
    if (page === 'calendario') renderCalendario();
    if (page === 'pomodoro') renderPomodoro();
    if (page === 'tiempo') renderTiempo();
    if (page === 'buscar') renderBuscar();
    const activePc = document.querySelector('.page.active .pc');
    if (activePc) activePc.scrollTop = 0;
    // Show FAB only on habits page
    const fab = document.querySelector('.fab');
    if (fab) fab.style.display = page === 'habitos' ? 'block' : 'none';
};

// ── TASKS MODULE ───────────────────────────────────
let curTaskFilter = 'todas';
let editTaskId = null;
let subtaskFields = [];

const taskDueBadge = (dateStr) => {
    if (!dateStr) return '';
    const due = new Date(dateStr + 'T00:00:00');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.round((due - now) / 86400000);
    if (diff < 0) return `<span class="task-date overdue">⚠ Vencida hace ${Math.abs(diff)}d</span>`;
    if (diff === 0) return `<span class="task-date" style="color:var(--a4)">📅 Hoy</span>`;
    if (diff === 1) return `<span class="task-date" style="color:var(--a)">📅 Mañana</span>`;
    return `<span class="task-date">📅 ${dateStr.slice(5).replace('-','/')}</span>`;
};

const tagClass = (cat) => ({
    'work': 'tag-work',
    'personal': 'tag-personal',
    'health': 'tag-health',
    'learn': 'tag-learn'
} [cat] || 'tag-work');
const tagLabel = (cat) => ({
    'work': '💼 Trabajo',
    'personal': '🏠 Personal',
    'health': '💪 Salud',
    'learn': '📚 Aprender'
} [cat] || cat);

window.renderTasks = () => {
    const el = document.getElementById('task-list');
    if (!el) return;
    if (!S.tasks) S.tasks = [];
    const td = today();
    const f = curTaskFilter;

    let list = [...S.tasks];
    if (f === 'hoy') list = list.filter(t => t.date === td && !t.done);
    else if (f === 'done') list = list.filter(t => t.done);
    else if (f !== 'todas') list = list.filter(t => t.cat === f && !t.done);
    else list = list.filter(t => !t.done);

    const priOrder = {
        high: 0,
        mid: 1,
        low: 2
    };
    list.sort((a, b) => {
        const pd = (priOrder[a.pri] || 1) - (priOrder[b.pri] || 1);
        if (pd !== 0) return pd;
        if (a.date && b.date) return a.date.localeCompare(b.date);
        return 0;
    });

    if (!list.length) {
        el.innerHTML = `<div class="tasks-empty"><div style="font-size:42px;margin-bottom:12px">${f==='done'?'🎉':'📭'}</div><div style="font-family:var(--fd);font-size:16px;font-weight:700;margin-bottom:6px">${f==='done'?'Sin tareas completadas':'Todo limpio'}</div><div style="font-size:12px;color:var(--m)">${f==='done'?'Completá tareas para verlas acá.':'No hay tareas pendientes aquí.'}</div></div>`;
        return;
    }

    el.innerHTML = list.map(t => {
        const subs = (t.subtasks || []);
        const doneSubs = subs.filter(s => s.done).length;
        const subsHtml = subs.length ? `<div class="subtask-list-view">${subs.slice(0,3).map(s=>`<div class="subtask-item"><div class="subtask-chk ${s.done?'done':''}" onclick="toggleSubtask('${t.id}','${s.id}',event)">${s.done?'✓':''}</div><span style="${s.done?'text-decoration:line-through;color:var(--m)':''}">${s.text}</span></div>`).join('')}${subs.length > 3 ? `<div style="font-size:10px;color:var(--m)">+${subs.length-3} más</div>`:''}</div>` : '';

        return `<div class="task-row ${t.done?'done-task':''}"><div class="task-pri pri-${t.pri||'mid'}"></div><div class="task-chk ${t.done?'done':''}" onclick="toggleTask('${t.id}',event)">${t.done?'✓':''}</div><div class="task-body"><div class="task-title ${t.done?'done':''}">${t.name}</div><div class="task-meta-row"><span class="task-tag ${tagClass(t.cat)}">${tagLabel(t.cat)}</span>${t.time?`<span style="font-size:10px;color:var(--m)">⏱ ${t.time}</span>`:''}${taskDueBadge(t.date)}${subs.length?`<span style="font-size:10px;color:var(--m)">${doneSubs}/${subs.length} ✓</span>`:''}</div>${t.notes?`<div style="font-size:11px;color:var(--m);margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.notes}</div>`:''}${subsHtml}</div><div class="task-actions"><div class="task-act-btn" onclick="openTaskSheet('${t.id}')">✎</div></div></div>`;
    }).join('');
};

window.toggleTask = (id, e) => {
    if (e) e.stopPropagation();
    const t = (S.tasks || []).find(x => x.id === id);
    if (!t) return;
    t.done = !t.done;
    if (t.done) {
        addXP(15);
        confetti();
        toast('✅ ¡Tarea completada!', 'success');
    }
    scheduleSave();
    renderTasks();
};

window.toggleSubtask = (taskId, subId, e) => {
    if (e) e.stopPropagation();
    const t = (S.tasks || []).find(x => x.id === taskId);
    if (!t || !t.subtasks) return;
    const s = t.subtasks.find(x => x.id === subId);
    if (s) {
        s.done = !s.done;
        scheduleSave();
        renderTasks();
    }
};

window.addQuickTaskInline = () => {
    const inp = document.getElementById('quick-task-inp');
    const nm = inp ? inp.value.trim() : '';
    if (!nm) return;
    if (!S.tasks) S.tasks = [];
    S.tasks.unshift({
        id: uid(),
        name: nm,
        pri: 'mid',
        cat: 'personal',
        done: false,
        date: '',
        time: '1h',
        notes: '',
        subtasks: [],
        created: today()
    });
    scheduleSave();
    inp.value = '';
    renderTasks();
    toast('⚡ Tarea agregada', 'success');
};

window.openTaskSheet = (id) => {
    editTaskId = id || null;
    const t = id ? (S.tasks || []).find(x => x.id === id) : null;
    document.getElementById('sh-task-title').textContent = t ? '✎ Editar tarea' : '✦ Nueva tarea';
    document.getElementById('task-nm').value = t ? t.name : '';
    document.getElementById('task-pri').value = t ? (t.pri || 'mid') : 'mid';
    document.getElementById('task-cat').value = t ? (t.cat || 'personal') : 'personal';
    document.getElementById('task-date').value = t ? (t.date || '') : '';
    document.getElementById('task-time').value = t ? (t.time || '1h') : '1h';
    document.getElementById('task-notes').value = t ? (t.notes || '') : '';
    const delBtn = document.getElementById('del-task-btn');
    if (delBtn) delBtn.style.display = t ? 'block' : 'none';
    subtaskFields = t ? (t.subtasks || []).map(s => ({
        ...s
    })) : [];
    renderSubtaskFields();
    document.getElementById('sh-task').classList.add('open');
};

window.addSubtaskField = () => {
    subtaskFields.push({
        id: uid(),
        text: '',
        done: false
    });
    renderSubtaskFields();
};

const renderSubtaskFields = () => {
    const el = document.getElementById('sbt-list');
    if (!el) return;
    el.innerHTML = subtaskFields.map((s, i) => `<div class="sbt-row"><div class="subtask-chk ${s.done?'done':''}" onclick="subtaskFields[${i}].done=!subtaskFields[${i}].done;renderSubtaskFields()">${s.done?'✓':''}</div><input class="sbt-inp" value="${s.text}" placeholder="Subtarea..." oninput="subtaskFields[${i}].text=this.value"/><button class="sbt-del" onclick="subtaskFields.splice(${i},1);renderSubtaskFields()">✕</button></div>`).join('');
};

window.saveTask = () => {
    const nm = document.getElementById('task-nm').value.trim();
    if (!nm) {
        toast('Escribí el nombre de la tarea', 'warn');
        return;
    }
    if (!S.tasks) S.tasks = [];
    const subs = subtaskFields.filter(s => s.text.trim()).map(s => ({
        ...s,
        text: s.text.trim()
    }));
    if (editTaskId) {
        const t = S.tasks.find(x => x.id === editTaskId);
        if (t) {
            t.name = nm;
            t.pri = document.getElementById('task-pri').value;
            t.cat = document.getElementById('task-cat').value;
            t.date = document.getElementById('task-date').value;
            t.time = document.getElementById('task-time').value;
            t.notes = document.getElementById('task-notes').value.trim();
            t.subtasks = subs;
        }
        toast('✅ Tarea actualizada', 'success');
    } else {
        S.tasks.unshift({
            id: uid(),
            name: nm,
            pri: document.getElementById('task-pri').value,
            cat: document.getElementById('task-cat').value,
            date: document.getElementById('task-date').value,
            time: document.getElementById('task-time').value,
            notes: document.getElementById('task-notes').value.trim(),
            subtasks: subs,
            done: false,
            created: today()
        });
        addXP(5);
        toast('✦ Tarea creada', 'success');
    }
    scheduleSave();
    csh('sh-task');
    renderTasks();
};

window.deleteTask = () => {
    if (!editTaskId) return;
    if (!confirm('¿Eliminar esta tarea?')) return;
    S.tasks = (S.tasks || []).filter(t => t.id !== editTaskId);
    scheduleSave();
    csh('sh-task');
    renderTasks();
    toast('🗑 Tarea eliminada', 'info');
};

window.setTF = (f, el) => {
    curTaskFilter = f;
    document.querySelectorAll('#task-filters .fp').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderTasks();
};

// ── GREETING ──────────────────────────────────────
const updateGreeting = () => {
    const h = new Date().getHours();
    let e = '☀️',
        s = 'Empezá el día con energía.';
    if (h < 6) {
        e = '🌙';
        s = 'Madrugada. ¡Cuidate!';
    } else if (h < 12) {
        e = '☀️';
        s = 'Buenos días. ¡A construir hábitos!';
    } else if (h < 18) {
        e = '🌤';
        s = 'Buenas tardes. ¿Ya marcaste tus hábitos?';
    } else {
        e = '🌙';
        s = 'Buenas noches. ¿Cómo te fue hoy?';
    }
    const ge = document.getElementById('gr-emoji');
    const gs = document.getElementById('gr-sub');
    if (ge) ge.textContent = e;
    if (gs) gs.textContent = s;
};

// ── STREAKS ───────────────────────────────────────
const getStreak = h => {
    let s = 0;
    for (let i = 0; i < 365; i++) {
        const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        if (h.logs && h.logs[k]) s++;
        else if (i > 0) break;
    }
    return s;
};
const getBest = h => {
    const keys = Object.keys(h.logs || {}).filter(k => h.logs[k]).sort();
    if (!keys.length) return 0;
    let b = 1,
        c = 1;
    for (let i = 1; i < keys.length; i++) {
        const diff = (new Date(keys[i]) - new Date(keys[i - 1])) / 86400000;
        if (diff === 1) {
            c++;
            b = Math.max(b, c);
        } else c = 1;
    }
    return b;
};
const getWeekKeys = () => {
    const keys = [],
        now = new Date(),
        dow = now.getDay(),
        mon = new Date(now);
    mon.setDate(now.getDate() - ((dow + 6) % 7));
    for (let i = 0; i < 7; i++) {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        keys.push(d.toISOString().slice(0, 10));
    }
    return keys;
};

// ── HABIT ROW ─────────────────────────────────────
const habitRow = (h, weekKeys, todayKey) => {
    const streak = getStreak(h);
    const dl = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
    const days = weekKeys.map((k, i) => {
        const done = h.logs && h.logs[k];
        const isT = k === todayKey;
        const cls = ['hd', done ? 'done' : '', isT && !done ? 'today' : ''].join(' ').trim();
        return `<div class="${cls}" onclick="window.toggleHabit('${h.id}','${k}')">${done?'✓':dl[i]}</div>`;
    }).join('');
    return `<div class="hr">
          <div class="hem">${h.emoji||'⭐'}</div>
          <div class="hinfo">
            <div class="hnm">${h.name}</div>
            ${h.goal?`<div class="hsub">${h.goal}</div>`:''}
            <div class="hwk">${days}</div>
          </div>
          <div class="hstr-wrap">
            <div class="hstr">${streak>0?'🔥'+streak:'–'}</div>
            <div class="hstr-lbl">${streak>0?'racha':''}</div>
          </div>
          <button class="icon-btn" style="margin-left:4px;font-size:12px;width:30px;height:30px" onclick="window.openHabit('${h.id}')">✎</button>
        </div>`;
};

window.toggleHabit = (id, dateKey) => {
    const h = S.habits.find(x => x.id === id);
    if (!h) return;
    if (!h.logs) h.logs = {};
    h.logs[dateKey] = !h.logs[dateKey];
    if (h.logs[dateKey]) {
        addXP(10);
        confetti();
        toast('🔥 ¡' + h.name + ' completado!', 'success');
    }
    scheduleSave();
    renderAll();
};

const renderHabitos = () => {
    const wk = getWeekKeys(),
        td = today(),
        f = S.curHF || 'todos';
    const list = f === 'todos' ? S.habits : S.habits.filter(h => h.area === f);
    const el = document.getElementById('hpc');
    if (!el) return;
    if (!list.length) {
        el.innerHTML = `<div class="empty"><div class="ei">🌱</div><div class="et">Sin hábitos aquí</div><div class="ed">Agregá uno con el botón de abajo.</div></div>`;
        return;
    }
    el.innerHTML = list.map(h => habitRow(h, wk, td)).join('');
};

window.setHF = (f, el) => {
    S.curHF = f;
    document.querySelectorAll('#hab-filters .fp').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderHabitos();
};

// ── DASHBOARD ─────────────────────────────────────
const renderDashboard = () => {
    renderFlowScore();
    renderStatsRow();
    renderProgressRing();
    renderDashHabits();
    renderDashWidgets();
};

const lvlName = l => ['Semilla', 'Brotando', 'En Forma', 'Constante', 'Imparable', 'Legendario', 'Máquina'][Math.min(l - 1, 6)];

const renderFlowScore = () => {
    const lvl = S.level || 1,
        xp = S.xp || 0,
        xpN = lvl * 100;
    const pct = Math.min(100, Math.round((xp % xpN) / xpN * 100));
    const avs = ['🌱', '⚡', '🔥', '💎', '🚀', '🌟', '👑'];
    const el = document.getElementById('gs-card');
    if (!el) return;
    el.innerHTML = `<div class="gs-avatar">${avs[Math.min(lvl-1,6)]}</div>
          <div class="gs-info">
            <div class="gs-name">Flow Score · ${CUR_USER||''}</div>
            <div class="gs-score">${xp} XP</div>
            <div class="gs-level">Nivel ${lvl} — ${lvlName(lvl)}</div>
            <div class="gs-bar"><div class="gs-fill" style="width:${pct}%"></div></div>
            <div class="gs-xp">${xp%xpN} / ${xpN} XP para nivel ${lvl+1}</div>
          </div>`;
};

const addXP = n => {
    S.xp = (S.xp || 0) + n;
    if (!S.level) S.level = 1;
    while (S.xp >= (S.level * S.level * 100)) {
        S.level += 1;
        toast(`🎉 ¡Nivel ${S.level}! ${lvlName(S.level)}`, 'success');
    }
};

const renderStatsRow = () => {
    const td = today();
    const done = S.habits.filter(h => h.logs && h.logs[td]).length;
    const best = S.habits.reduce((a, h) => Math.max(a, getStreak(h)), 0);
    const el = document.getElementById('sr');
    if (!el) return;
    el.innerHTML = `
          <div class="sc c1"><div class="si">✅</div><div class="sv c1">${done}/${S.habits.length}</div><div class="sl">Hoy</div></div>
          <div class="sc c2"><div class="si">🔥</div><div class="sv c2">${best}</div><div class="sl">Mejor racha</div></div>
          <div class="sc c3"><div class="si">⭐</div><div class="sv c3">${S.xp||0}</div><div class="sl">XP total</div></div>
          <div class="sc c4"><div class="si">🏆</div><div class="sv c4">${S.level||1}</div><div class="sl">Nivel</div></div>`;
};

const renderProgressRing = () => {
    const td = today(),
        tot = S.habits.length,
        done = S.habits.filter(h => h.logs && h.logs[td]).length;
    const pct = tot ? Math.round(done / tot * 100) : 0;
    const r = 30,
        circ = 2 * Math.PI * r,
        stroke = circ - (pct / 100) * circ;
    const msg = pct >= 100 ? '🎉 ¡Día perfecto! Todos completados.' : pct >= 50 ? '💪 ¡Vas bien! Seguí así.' : done === 0 ? '🌅 ¡Empezá tu racha hoy!' : '⚡ Faltan ' + (tot - done) + ' hábito' + (tot - done > 1 ? 's' : '') + '.';
    const el = document.getElementById('prg');
    if (!el) return;
    el.innerHTML = `<div class="prw">
          <div class="rb">
            <svg width="72" height="72" viewBox="0 0 72 72">
              <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--b)" stroke-width="6"/>
              <circle cx="36" cy="36" r="${r}" fill="none" stroke="var(--a)" stroke-width="6"
                stroke-linecap="round" stroke-dasharray="${circ.toFixed(2)}" stroke-dashoffset="${stroke.toFixed(2)}"
                style="transition:stroke-dashoffset .8s ease"/>
            </svg>
            <div class="rt">${pct}%</div>
          </div>
          <div class="ri"><div class="rti">${done} de ${tot} hábitos</div><div class="rts">${msg}</div></div>
        </div>`;
};

const renderDashHabits = () => {
    const wk = getWeekKeys(),
        td = today(),
        el = document.getElementById('dh');
    if (!el) return;
    if (!S.habits.length) {
        el.innerHTML = `<div class="empty"><div class="ei">🌱</div><div class="et">Sin hábitos</div></div>`;
        return;
    }
    el.innerHTML = S.habits.slice(0, 6).map(h => habitRow(h, wk, td)).join('');
};

const renderDashWidgets = () => {
    // Sleep widget
    const sleepEl = document.getElementById('dash-sleep');
    if (sleepEl) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const ydKey = yesterday.toISOString().slice(0, 10);
        const lastSleep = S.sleep && S.sleep.find(s => s.date === ydKey);
        const sleepValue = lastSleep ? `${lastSleep.hours}h ${lastSleep.quality}/5` : 'Sin datos';
        document.getElementById('dash-sleep-value').textContent = sleepValue;
        sleepEl.onclick = null;
    }

    // Mood widget
    const moodEl = document.getElementById('dash-mood');
    if (moodEl) {
        const td = today();
        const todayMood = S.moods && S.moods.find(m => m.date === td);
        const moodValue = todayMood ? `${todayMood.mood}/5` : 'Sin registrar';
        document.getElementById('dash-mood-value').textContent = moodValue;
        moodEl.onclick = null;
    }

    // Goals widget
    const goalsEl = document.getElementById('dash-goals');
    if (goalsEl) {
        const activeGoals = S.goals ? S.goals.filter(g => !g.done).length : 0;
        document.getElementById('dash-goals-value').textContent = `${activeGoals} activas`;
        goalsEl.onclick = () => gp('metas');
    }
};

// ── NOTES & WIKI MODULE (renderNotas) ───────────────────────────────
let noteFilter = 'todas';
let editNoteId = null;
let notePreview = false;
let notePinned = false;
let noteColor = 0;
let noteAutoSaveTimer = null;

const notesInit = () => {
    if (!S.notes) S.notes = [];
    if (!S.noteFolders) S.noteFolders = ['General'];
};

window.renderNotas = () => {
    notesInit();
    renderNotesList();
    renderNotesStats();
};

const renderNotesStats = () => {
    const el = document.getElementById('notes-stats-row');
    if (!el) return;
    const n = S.notes;
    const words = n.reduce((s, x) => s + (x.body || '').split(/\s+/).filter(Boolean).length, 0);
    const tags = [...new Set(n.flatMap(x => (x.tags || [])))].length;
    el.innerHTML = `
          <div class="notes-stat"><div class="notes-stat-val">${n.length}</div><div class="notes-stat-lbl">Notas</div></div>
          <div class="notes-stat"><div class="notes-stat-val">${tags}</div><div class="notes-stat-lbl">Tags</div></div>
          <div class="notes-stat"><div class="notes-stat-val">${words>999?Math.round(words/1000)+'k':words}</div><div class="notes-stat-lbl">Palabras</div></div>`;
};

const renderFolderRow = () => {
    const el = document.getElementById('folder-row');
    if (!el) return;
    const folders = ['todas', ...(S.noteFolders || [])];
    const counts = {};
    (S.notes || []).forEach(n => {
        counts[n.folder || 'General'] = (counts[n.folder || 'General'] || 0) + 1;
    });
    el.innerHTML = folders.map(f => {
        const label = f === 'todas' ? 'Todas' : f;
        const cnt = f === 'todas' ? S.notes.length : (counts[f] || 0);
        return `<button class="folder-chip ${noteFilter===f?'active':''}" onclick="setNoteFolder('${f}',this)">
            ${f==='todas'?'📂':''} ${label} <span class="fc-count">${cnt}</span>
          </button>`;
    }).join('');
};

window.setNoteFolder = (f, el) => {
    noteFilter = f;
    document.querySelectorAll('.folder-chip').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderNotesList();
};

window.filterNotes = () => {
    renderNotesList();
};

const renderNotesList = () => {
    const el = document.getElementById('notes-list');
    if (!el) return;
    notesInit();
    const q = (document.getElementById('notes-search-inp')?.value || '').toLowerCase().trim();
    let list = [...S.notes];
    if (noteFilter !== 'todas') list = list.filter(n => (n.folder || 'General') === noteFilter);
    if (q) list = list.filter(n =>
        (n.title || '').toLowerCase().includes(q) ||
        (n.body || '').toLowerCase().includes(q) ||
        (n.tags || []).some(t => t.toLowerCase().includes(q))
    );
    list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));

    if (!list.length) {
        el.innerHTML = `<div class="empty"><div class="ei">📝</div><div class="et">${q?'Sin resultados':'Sin notas'}</div><div class="ed">${q?'Probá con otro término.':'Tocá ✦ para crear tu primera nota.'}</div></div>`;
        return;
    }

    el.innerHTML = list.map(n => {
        const excerpt = (n.body || '').replace(/[#*`>\-_\[\]]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
        const tagsHtml = (n.tags || []).slice(0, 3).map(t => `<span class="note-tag">#${t}</span>`).join('');
        const d = new Date(n.updatedAt || n.createdAt || Date.now());
        const dateStr = `${d.getDate()}/${d.getMonth()+1}`;
        return `<div class="note-card clr-${n.color||0} ${n.pinned?'pinned-note':''}" onclick="openNoteEditor('${n.id}')">
            <div class="note-card-head">
              ${n.pinned?'<div class="note-pin-icon">📌</div>':''}
              <div class="note-title">${n.title||'Sin título'}</div>
            </div>
            ${excerpt?`<div class="note-excerpt">${excerpt}</div>`:''}
            <div class="note-meta-row">
              ${tagsHtml}
              <span class="note-date">${dateStr}</span>
            </div>
            <div class="note-card-actions">
              <button class="note-edit-btn" onclick="openNoteEditor('${n.id}'); event.stopPropagation()" title="Editar">✎</button>
              <button class="note-del-btn" onclick="deleteNote('${n.id}'); event.stopPropagation()" title="Eliminar">🗑</button>
            </div>
          </div>`;
    }).join('');
};

window.openNoteEditor = (id) => {
    notesInit();
    editNoteId = id || null;
    const n = id ? S.notes.find(x => x.id === id) : null;
    notePinned = n?.pinned || false;
    noteColor = n?.color || 0;
    notePreview = false;

    document.getElementById('note-title-inp').value = n?.title || '';
    document.getElementById('note-body-inp').value = n?.body || '';
    document.getElementById('note-tags-inp').value = (n?.tags || []).join(', ');

    const sel = document.getElementById('note-folder-sel');
    if (sel) {
        sel.innerHTML = (S.noteFolders || ['General']).map(f => `<option value="${f}" ${(n?.folder||'General')===f?'selected':''}>${f}</option>`).join('');
    }
    document.querySelectorAll('.note-color-opt').forEach(el => el.classList.toggle('sel', parseInt(el.dataset.c) === noteColor));
    document.getElementById('ned-pin-btn').style.opacity = notePinned ? '1' : '.5';
    document.getElementById('ned-del-btn').style.display = id ? 'flex' : 'none';

    document.getElementById('note-preview-pane').style.display = 'none';
    document.getElementById('note-body-inp').style.display = 'block';
    document.getElementById('ned-preview-btn').classList.remove('active-btn');

    document.getElementById('note-editor-overlay').style.display = 'flex';
};

window.closeNoteEditor = () => {
    saveCurrentNote();
    document.getElementById('note-editor-overlay').style.display = 'none';
    editNoteId = null;
    renderNotas();
};

window.addNote = () => openNoteEditor();
window.deleteCurrentNote = () => {
    if (!editNoteId) {
        document.getElementById('note-editor-overlay').style.display = 'none';
        return;
    }
    deleteNote(editNoteId);
    document.getElementById('note-editor-overlay').style.display = 'none';
    editNoteId = null;
};

window.onNoteInput = () => {
    if (notePreview) updateNotePreview();
    clearTimeout(noteAutoSaveTimer);
    noteAutoSaveTimer = setTimeout(saveCurrentNote, 2000);
};

window.saveCurrentNote = () => {
    notesInit();
    const title = document.getElementById('note-title-inp').value.trim();
    const body = document.getElementById('note-body-inp').value;
    const folder = document.getElementById('note-folder-sel')?.value || 'General';
    const tagsRaw = document.getElementById('note-tags-inp').value;
    const tags = tagsRaw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    if (!title && !body) return;

    const now = new Date().toISOString();
    if (editNoteId) {
        const n = S.notes.find(x => x.id === editNoteId);
        if (n) {
            n.title = title || 'Sin título';
            n.body = body;
            n.folder = folder;
            n.tags = tags;
            n.color = noteColor;
            n.pinned = notePinned;
            n.updatedAt = now;
        }
    } else {
        const newNote = {
            id: uid(),
            title: title || 'Sin título',
            body,
            folder,
            tags,
            color: noteColor,
            pinned: notePinned,
            createdAt: now,
            updatedAt: now
        };
        S.notes.unshift(newNote);
        editNoteId = newNote.id;
        document.getElementById('ned-del-btn').style.display = 'flex';
    }
    scheduleSave();
};

window.deleteNote = (id) => {
    if (!confirm('¿Eliminar esta nota?')) return;
    S.notes = S.notes.filter(n => n.id !== id);
    scheduleSave();
    renderNotas();
    toast('🗑 Nota eliminada', 'info');
};

window.toggleNotePin = () => {
    notePinned = !notePinned;
    document.getElementById('ned-pin-btn').style.opacity = notePinned ? '1' : '.5';
    saveCurrentNote();
};

window.toggleNotePreview = () => {
    notePreview = !notePreview;
    const prev = document.getElementById('note-preview-pane');
    const ed = document.getElementById('note-body-inp');
    const btn = document.getElementById('ned-preview-btn');
    if (notePreview) {
        updateNotePreview();
        prev.style.display = 'block';
        ed.style.flex = '1';
        btn.classList.add('active-btn');
    } else {
        prev.style.display = 'none';
        btn.classList.remove('active-btn');
    }
};

const updateNotePreview = () => {
    const prev = document.getElementById('note-preview-pane');
    if (!prev || !notePreview) return;
    const body = document.getElementById('note-body-inp').value;
    try {
        prev.innerHTML = typeof marked !== 'undefined' ? marked.parse(body) : body.replace(/\n/g, '<br>');
        prev.querySelectorAll('li').forEach(li => {
            if (li.innerHTML.startsWith('[ ]')) li.innerHTML = li.innerHTML.replace('[ ]', '<input type="checkbox" onclick="this.parentNode.querySelector(\'s,span\')&&void 0">');
            if (li.innerHTML.startsWith('[x]') || li.innerHTML.startsWith('[X]')) li.innerHTML = li.innerHTML.replace(/\[x\]/i, '<input type="checkbox" checked>');
        });
    } catch (e) {
        prev.textContent = body;
    }
};

window.selNoteColor = (c, el) => {
    noteColor = c;
    document.querySelectorAll('.note-color-opt').forEach(x => x.classList.remove('sel'));
    if (el) el.classList.add('sel');
};

window.mdInsert = (before, after, placeholder) => {
    const ta = document.getElementById('note-body-inp');
    const s = ta.selectionStart,
        e = ta.selectionEnd;
    const sel = ta.value.slice(s, e) || placeholder;
    ta.value = ta.value.slice(0, s) + before + sel + after + ta.value.slice(e);
    ta.selectionStart = s + before.length;
    ta.selectionEnd = s + before.length + sel.length;
    ta.focus();
    onNoteInput();
};

window.mdInsertLine = (prefix) => {
    const ta = document.getElementById('note-body-inp');
    const s = ta.selectionStart;
    const lineStart = ta.value.lastIndexOf('\n', s - 1) + 1;
    ta.value = ta.value.slice(0, lineStart) + prefix + ta.value.slice(lineStart);
    ta.selectionStart = ta.selectionEnd = lineStart + prefix.length;
    ta.focus();
    onNoteInput();
};

window.mdInsertLink = () => {
    const url = prompt('URL del enlace:', 'https://');
    if (!url) return;
    mdInsert('[', '](' + url + ')', 'texto del enlace');
};

window.openFolderSheet = () => {
    notesInit();
    renderFolderListSheet();
    document.getElementById('sh-folder').classList.add('open');
};

const renderFolderListSheet = () => {
    const el = document.getElementById('folder-list-sh');
    if (!el) return;
    el.innerHTML = (S.noteFolders || []).map((f, i) => `
          <div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--b)">
            <span style="font-size:13px;flex:1">📁 ${f}</span>
            ${i > 0 ? `<button onclick="deleteFolder('${f}')" style="font-size:11px;color:var(--m2);background:none;border:none;cursor:pointer">✕</button>` : ''}
          </div>`).join('');
};

window.addFolder = () => {
    const inp = document.getElementById('new-folder-inp');
    const name = inp?.value.trim();
    if (!name) return;
    notesInit();
    if (!S.noteFolders.includes(name)) {
        S.noteFolders.push(name);
        scheduleSave();
        inp.value = '';
        renderFolderListSheet();
        renderFolderRow();
        toast('📁 Carpeta creada', 'success');
    } else {
        toast('Esa carpeta ya existe', 'warn');
    }
};

window.deleteFolder = (name) => {
    if (!confirm(`¿Eliminar carpeta "${name}"? Las notas se moverán a General.`)) return;
    S.noteFolders = S.noteFolders.filter(f => f !== name);
    S.notes.forEach(n => {
        if (n.folder === name) n.folder = 'General';
    });
    scheduleSave();
    renderFolderListSheet();
    renderFolderRow();
    renderNotesList();
};

// ── STATS ─────────────────────────────────────────
const renderStats = () => {
    const td = today();
    const done = S.habits.filter(h => h.logs && h.logs[td]).length;
    const allLogs = S.habits.flatMap(h => Object.values(h.logs || {}).filter(Boolean));
    const best = S.habits.reduce((a, h) => Math.max(a, getBest(h)), 0);
    const top = document.getElementById('stats-top');
    if (top) top.innerHTML = `
          <div class="hs-cell"><div class="hs-val">${done}/${S.habits.length}</div><div class="hs-lbl">Hoy</div></div>
          <div class="hs-cell"><div class="hs-val">${allLogs.length}</div><div class="hs-lbl">Total logs</div></div>
          <div class="hs-cell"><div class="hs-val">${best}🔥</div><div class="hs-lbl">Mejor racha</div></div>`;
    const wk = getWeekKeys();
    const labs = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    const tots = wk.map(k => S.habits.filter(h => h.logs && h.logs[k]).length);
    const maxV = Math.max(...tots, 1);
    const wc = document.getElementById('week-chart');
    if (wc) wc.innerHTML = `<div style="font-family:var(--fd);font-size:14px;font-weight:700;margin-bottom:14px">Hábitos por día</div>
          <div class="bar-chart">${tots.map((v,i)=>`
            <div class="bar-w">
              <div class="bar-val">${v}</div>
              <div class="bar" style="height:${Math.max(3,Math.round(v/maxV*68))}px"></div>
              <div class="bar-lbl">${labs[i]}</div>
            </div>`).join('')}
          </div>`;
    const sl = document.getElementById('streaks-list');
    if (sl) {
        const sorted = [...S.habits].map(h => ({
            ...h,
            streak: getStreak(h),
            best: getBest(h)
        })).sort((a, b) => b.streak - a.streak);
        sl.innerHTML = sorted.map(h => `
            <div class="hr">
              <div class="hem">${h.emoji}</div>
              <div class="hinfo">
                <div class="hnm">${h.name}</div>
                <div style="display:flex;gap:8px;margin-top:4px;flex-wrap:wrap">
                  <span class="streak-badge">🔥 ${h.streak} días</span>
                  <span class="streak-badge" style="background:rgba(124,109,250,.1);color:var(--a);border-color:rgba(124,109,250,.2)">🏆 mejor: ${h.best}</span>
                </div>
              </div>
            </div>`).join('');
    }
    const hm = document.getElementById('heatmap-grid');
    if (hm) {
        const cells = [];
        for (let i = 27; i >= 0; i--) {
            const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
            const cnt = S.habits.filter(h => h.logs && h.logs[k]).length;
            const pct = cnt / (S.habits.length || 1);
            let cls = 'hm';
            if (pct > 0.75) cls += ' d4';
            else if (pct > 0.5) cls += ' d3';
            else if (pct > 0.25) cls += ' d2';
            else if (cnt > 0) cls += ' d1';
            cells.push(`<div class="${cls}" title="${k}: ${cnt}/${S.habits.length}"></div>`);
        }
        hm.innerHTML = cells.join('');
    }
};

// ── LECTURA ───────────────────────────────────────
const renderLectura = () => {
    const bl = document.getElementById('books-list');
    if (!bl) return;
    if (!S.books) S.books = [];
    bl.innerHTML = S.books.map(b => `
          <div class="hr" onclick="openBookSheet('${b.id}')">
            <div class="hem" style="font-size:24px">${b.emoji}</div>
            <div class="hinfo">
              <div class="hnm">${b.title}</div>
              <div class="hsub">${b.author} • ${b.curPage}/${b.pages} páginas</div>
              <div style="display:flex;gap:6px;margin-top:4px">
                <span class="streak-badge" style="background:${b.coverColor}20;border-color:${b.coverColor}40;color:${b.coverColor}">${b.status}</span>
                <span class="streak-badge">${b.genre}</span>
              </div>
            </div>
          </div>`).join('');
};

// ── NOTIFS ─────────────────────────────────────────
const renderNotifs = () => {
    const nc = document.getElementById('notifs-content');
    if (!nc) return;
    if (!S.notifSettings) S.notifSettings = {
        enabled: false,
        habits: {},
        dailySummary: '21:00',
        remindUnmarked: true
    };
    nc.innerHTML = `
          <div class="ss-group">
            <div class="ss-item">
              <div class="ss-ic">🔔</div>
              <div class="ss-inf"><div class="ss-lb">Notificaciones</div><div class="ss-ds">${Notification.permission==='granted' ? 'Permitidas' : Notification.permission==='denied' ? 'Denegadas (ajustes)' : 'No solicitadas'}</div></div>
              <button class="tgl ${S.notifSettings.enabled ? 'on' : ''}" onclick="toggleNotifs(); updateNotifIcon()"></button>
            </div>
            <div class="ss-item">
              <div class="ss-ic">📅</div>
              <div class="ss-inf"><div class="ss-lb">Resumen diario</div><div class="ss-ds">Hora del recordatorio</div></div>
              <input type="time" value="${S.notifSettings.dailySummary}" onchange="S.notifSettings.dailySummary=this.value; scheduleSave()" style="background:var(--s2);border:1px solid var(--b);border-radius:6px;padding:4px 8px;font-size:12px"/>
            </div>
            <div class="ss-item">
              <div class="ss-ic">✅</div>
              <div class="ss-inf"><div class="ss-lb">Recordar hábitos sin marcar</div><div class="ss-ds">A las 9 PM</div></div>
              <button class="tgl ${S.notifSettings.remindUnmarked ? 'on' : ''}" onclick="S.notifSettings.remindUnmarked=!S.notifSettings.remindUnmarked; scheduleSave(); renderNotifs()"></button>
            </div>
          </div>`;
    updateNotifIcon();
};

window.updateNotifIcon = () => {
    const btn = document.getElementById('notif-toggle-btn');
    if (!btn) return;
    const enabled = S.notifSettings?.enabled;
    const permission = Notification.permission;
    btn.textContent = enabled && permission === 'granted' ? '🔔' : '🔕';
    btn.title = enabled && permission === 'granted' ? 'Notificaciones activas' : 'Presiona para pedir permiso y activar';
    if (enabled && permission === 'granted') {
        btn.style.background = 'rgba(124, 109, 250, 0.22)';
    } else {
        btn.style.background = 'transparent';
    }
};

// ── LOGROS ─────────────────────────────────────────
const renderLogros = () => {
    const al = document.getElementById('achievements-list');
    if (!al) return;
    const achievements = [
        {
            id: 'first_habit',
            name: 'Primer hábito',
            desc: 'Creaste tu primer hábito',
            icon: '🎯',
            unlocked: S.habits.length > 0
        },
        {
            id: 'ten_habits',
            name: 'Hábitos múltiples',
            desc: 'Creaste 10 hábitos',
            icon: '🔥',
            unlocked: S.habits.length >= 10
        },
        {
            id: 'fifty_habits',
            name: 'Maestro de hábitos',
            desc: 'Creaste 50 hábitos',
            icon: '🏅',
            unlocked: S.habits.length >= 50
        },
        {
            id: 'week_streak',
            name: 'Semana perfecta',
            desc: 'Completaste todos los hábitos por 7 días',
            icon: '🔥',
            unlocked: S.habits.some(h => getStreak(h) >= 7)
        },
        {
            id: 'month_streak',
            name: 'Mes de consistencia',
            desc: 'Mantuviste una racha de 30 días',
            icon: '🏆',
            unlocked: S.habits.some(h => getStreak(h) >= 30)
        },
        {
            id: 'hundred_streak',
            name: 'Leyenda',
            desc: '100 días de racha en un hábito',
            icon: '👑',
            unlocked: S.habits.some(h => getStreak(h) >= 100)
        },
        {
            id: 'year_streak',
            name: 'Inmortal',
            desc: '365 días de racha',
            icon: '🌟',
            unlocked: S.habits.some(h => getStreak(h) >= 365)
        },
        {
            id: 'book_finished',
            name: 'Lector voraz',
            desc: 'Terminaste tu primer libro',
            icon: '📚',
            unlocked: S.books && S.books.some(b => b.status === 'terminado')
        },
        {
            id: 'five_books',
            name: 'Bibliófilo',
            desc: 'Terminaste 5 libros',
            icon: '📖',
            unlocked: S.books && S.books.filter(b => b.status === 'terminado').length >= 5
        },
        {
            id: 'ten_books',
            name: 'Erudito',
            desc: 'Terminaste 10 libros',
            icon: '🎓',
            unlocked: S.books && S.books.filter(b => b.status === 'terminado').length >= 10
        },
        {
            id: 'first_note',
            name: 'Primer apunte',
            desc: 'Creaste tu primera nota',
            icon: '📝',
            unlocked: S.notes && S.notes.length > 0
        },
        {
            id: 'note_master',
            name: 'Escritor prolífico',
            desc: 'Creaste 50 notas',
            icon: '✍️',
            unlocked: S.notes && S.notes.length >= 50
        },
        {
            id: 'first_task',
            name: 'Productivo',
            desc: 'Completaste tu primera tarea',
            icon: '✅',
            unlocked: S.tasks && S.tasks.some(t => t.done)
        },
        {
            id: 'hundred_tasks',
            name: 'Máquina de tareas',
            desc: 'Completaste 100 tareas',
            icon: '🚀',
            unlocked: S.tasks && S.tasks.filter(t => t.done).length >= 100
        },
        {
            id: 'first_goal',
            name: 'Ambicioso',
            desc: 'Creaste tu primera meta',
            icon: '🎯',
            unlocked: S.goals && S.goals.length > 0
        },
        {
            id: 'ten_goals',
            name: 'Visionario',
            desc: 'Completaste 10 metas',
            icon: '🏔️',
            unlocked: S.goals && S.goals.filter(g => g.done).length >= 10
        },
        {
            id: 'first_sleep',
            name: 'Descansado',
            desc: 'Registraste tu primera noche de sueño',
            icon: '😴',
            unlocked: S.sleep && S.sleep.length > 0
        },
        {
            id: 'thirty_sleep',
            name: 'Experto en sueño',
            desc: 'Registraste 30 noches de sueño',
            icon: '🌙',
            unlocked: S.sleep && S.sleep.length >= 30
        },
        {
            id: 'first_mood',
            name: 'Consciente',
            desc: 'Registraste tu primer estado de ánimo',
            icon: '😊',
            unlocked: S.moods && S.moods.length > 0
        },
        {
            id: 'thirty_mood',
            name: 'Psicólogo',
            desc: 'Registraste 30 estados de ánimo',
            icon: '🧠',
            unlocked: S.moods && S.moods.length >= 30
        },
        {
            id: 'first_water',
            name: 'Hidratado',
            desc: 'Alcanzaste tu meta de agua por primera vez',
            icon: '💧',
            unlocked: S.water && S.water.logs && Object.keys(S.water.logs).length > 0
        },
        {
            id: 'seven_water',
            name: 'Acuático',
            desc: 'Alcanzaste la meta de agua 7 días seguidos',
            icon: '🌊',
            unlocked: S.water && S.water.logs && Object.values(S.water.logs).filter(l => l >= S.water.goal).length >= 7
        },
        {
            id: 'first_pom',
            name: 'Enfocado',
            desc: 'Completaste tu primera sesión Pomodoro',
            icon: '🍅',
            unlocked: S.pom && S.pom.sessions && S.pom.sessions.length > 0
        },
        {
            id: 'hundred_pom',
            name: 'Meditativo',
            desc: 'Completaste 100 sesiones Pomodoro',
            icon: '🧘',
            unlocked: S.pom && S.pom.sessions && S.pom.sessions.length >= 100
        },
        {
            id: 'first_transaction',
            name: 'Financiero',
            desc: 'Registraste tu primera transacción',
            icon: '💰',
            unlocked: S.finance && S.finance.transactions && S.finance.transactions.length > 0
        },
        {
            id: 'hundred_transactions',
            name: 'Contador',
            desc: 'Registraste 100 transacciones',
            icon: '📊',
            unlocked: S.finance && S.finance.transactions && S.finance.transactions.length >= 100
        },
        {
            id: 'first_event',
            name: 'Organizado',
            desc: 'Creaste tu primer evento',
            icon: '📅',
            unlocked: S.events && S.events.length > 0
        },
        {
            id: 'fifty_events',
            name: 'Planificador',
            desc: 'Creaste 50 eventos',
            icon: '🗓️',
            unlocked: S.events && S.events.length >= 50
        },
        {
            id: 'first_meal',
            name: 'Nutricionista',
            desc: 'Registraste tu primera comida',
            icon: '🍽️',
            unlocked: S.meals && S.meals.length > 0
        },
        {
            id: 'thirty_meals',
            name: 'Chef',
            desc: 'Registraste 30 comidas',
            icon: '👨‍🍳',
            unlocked: S.meals && S.meals.length >= 30
        },
        {
            id: 'level_five',
            name: 'Nivel 5',
            desc: 'Alcanzaste el nivel 5',
            icon: '⭐',
            unlocked: S.level >= 5
        },
        {
            id: 'level_ten',
            name: 'Nivel 10',
            desc: 'Alcanzaste el nivel 10',
            icon: '🌟',
            unlocked: S.level >= 10
        },
        {
            id: 'thousand_xp',
            name: 'Experto',
            desc: 'Ganaste 1,000 XP',
            icon: '💎',
            unlocked: S.xp >= 1000
        },
        {
            id: 'five_thousand_xp',
            name: 'Maestro',
            desc: 'Ganaste 5,000 XP',
            icon: '👑',
            unlocked: S.xp >= 5000
        }
    ];
    al.innerHTML = achievements.map(a => `
          <div class="hr" style="opacity:${a.unlocked ? 1 : 0.5}">
            <div class="hem" style="font-size:24px">${a.icon}</div>
            <div class="hinfo">
              <div class="hnm">${a.name}</div>
              <div class="hsub">${a.desc}</div>
              ${a.unlocked ? '<span class="streak-badge">✅ Desbloqueado</span>' : '<span class="streak-badge" style="background:var(--b);color:var(--m)">🔒 Bloqueado</span>'}
            </div>
          </div>`).join('');
};

// ── ADMIN ──────────────────────────────────────────
const loadAdminData = () => {
    const ac = document.getElementById('admin-content');
    if (!ac) return;
    ac.innerHTML = '<div class="admin-spin"></div>';
    // Simulate loading users
    setTimeout(() => {
        ac.innerHTML = `
            <div class="admin-header">
              <div class="admin-title">Panel de Administración</div>
              <div class="admin-sub">Gestioná usuarios y datos globales</div>
            </div>
            <div class="global-stat-grid">
              <div class="global-stat"><div class="global-stat-val">1,234</div><div class="global-stat-lbl">Usuarios totales</div></div>
              <div class="global-stat"><div class="global-stat-val">45,678</div><div class="global-stat-lbl">Hábitos creados</div></div>
              <div class="global-stat"><div class="global-stat-val">89,012</div><div class="global-stat-lbl">Sesiones completadas</div></div>
            </div>
            <div style="margin-top:20px">
              <button class="plan-btn" onclick="alert('Función próximamente')">📊 Ver estadísticas detalladas</button>
            </div>`;
    }, 1000);
};
// ── HABIT CRUD ─────────────────────────────────────
let editHId = null;
window.openHabit = (id) => {
    editHId = id || null;
    const h = id ? S.habits.find(x => x.id === id) : null;
    document.getElementById('sh-h-title').textContent = h ? '✎ Editar hábito' : '🔥 Nuevo hábito';
    document.getElementById('h-nm').value = h ? h.name : '';
    document.getElementById('h-em').value = h ? h.emoji : '';
    document.getElementById('h-ar').value = h ? h.area : 'salud';
    document.getElementById('h-fr').value = h ? h.freq : 'daily';
    document.getElementById('h-reminder').value = h ? (h.reminder || '') : '';
    document.getElementById('h-goal').value = h ? (h.goal || '') : '';
    const delBtn = document.getElementById('del-habit-btn');
    if (delBtn) delBtn.style.display = h ? 'block' : 'none';
    document.getElementById('sh-h').classList.add('open');
};

window.saveHabit = () => {
    const nm = document.getElementById('h-nm').value.trim();
    if (!nm) {
        toast('Escribí el nombre del hábito', 'warn');
        return;
    }
    if (editHId) {
        const h = S.habits.find(x => x.id === editHId);
        if (h) {
            h.name = nm;
            h.emoji = document.getElementById('h-em').value.trim() || '⭐';
            h.area = document.getElementById('h-ar').value;
            h.freq = document.getElementById('h-fr').value;
            h.goal = document.getElementById('h-goal').value.trim();
            h.reminder = document.getElementById('h-reminder').value || null;
        }
        toast('✅ Hábito actualizado', 'success');
    } else {
        S.habits.push({
            id: uid(),
            name: nm,
            emoji: document.getElementById('h-em').value.trim() || '⭐',
            area: document.getElementById('h-ar').value,
            freq: document.getElementById('h-fr').value,
            goal: document.getElementById('h-goal').value.trim(),
            reminder: document.getElementById('h-reminder').value || null,
            logs: {},
            created: today()
        });
        addXP(20);
        toast('🔥 Hábito creado', 'success');
    }
    scheduleSave();
    csh('sh-h');
    renderAll();
};

window.deleteHabit = () => {
    if (!editHId) return;
    if (!confirm('¿Eliminar este hábito? Se perderán todos sus registros.')) return;
    S.habits = S.habits.filter(h => h.id !== editHId);
    scheduleSave();
    csh('sh-h');
    renderAll();
    toast('🗑 Hábito eliminado', 'info');
};

// ── SETTINGS ──────────────────────────────────────
const renderSettings = () => {
    const el = document.getElementById('settc');
    if (!el) return;
    const themes = [
        ['', 'linear-gradient(135deg,#7c6dfa,#fa6d8f)', 'Morado'],
        ['th-green', 'linear-gradient(135deg,#22c55e,#6dfac4)', 'Verde'],
        ['th-pink', 'linear-gradient(135deg,#f472b6,#fb923c)', 'Rosa'],
        ['th-cyan', 'linear-gradient(135deg,#22d3ee,#6dfac4)', 'Cyan'],
        ['th-orange', 'linear-gradient(135deg,#f97316,#fac46d)', 'Naranja'],
        ['th-red', 'linear-gradient(135deg,#ef4444,#fac46d)', 'Rojo'],
        ['light', 'linear-gradient(135deg,#f0f0fa,#ddddf0)', 'Claro'],
    ];
    el.innerHTML = `
          <div style="font-family:var(--fd);font-size:12px;color:var(--m);text-transform:uppercase;letter-spacing:.1em;margin-bottom:8px">Cuenta</div>
          <div class="ss-group">
            <div class="ss-item">
              <div class="ss-ic" style="background:rgba(124,109,250,.12)">👤</div>
              <div class="ss-inf"><div class="ss-lb" style="display:flex;align-items:center;gap:8px">@${CUR_USER||''} ${isCreator()?'<span class="creator-badge"><span class="creator-crown">👑</span> CREADOR</span>':''}</div><div class="ss-ds">${S.name||''} · Nivel ${S.level||1} · ${S.xp||0} XP</div></div>
            </div>
            <div class="ss-item" onclick="window.doLogout()">
              <div class="ss-ic" style="background:rgba(250,109,143,.12)">🚪</div>
              <div class="ss-inf"><div class="ss-lb">Cerrar sesión</div><div class="ss-ds">Salir de esta cuenta</div></div>
              <div class="ss-arr">›</div>
            </div>
          </div>
          <div style="font-family:var(--fd);font-size:12px;color:var(--m);text-transform:uppercase;letter-spacing:.1em;margin:16px 0 8px">Apariencia</div>
          <div class="ss-group">
            <div class="tp-row">
              ${themes.map(([t,c,n])=>`<div class="tpi ${S.theme===t?'sel':''}" onclick="window.applyTheme('${t}',this)" title="${n}"><div class="tpin" style="background:${c}"></div></div>`).join('')}
            </div>
          </div>
          <div style="font-family:var(--fd);font-size:12px;color:var(--m);text-transform:uppercase;letter-spacing:.1em;margin:16px 0 8px">Datos</div>
          <div class="ss-group">
            <div class="ss-item" onclick="window.exportData()">
              <div class="ss-ic" style="background:rgba(109,250,196,.12)">📤</div>
              <div class="ss-inf"><div class="ss-lb">Exportar datos</div><div class="ss-ds">Descargá un backup JSON</div></div>
              <div class="ss-arr">›</div>
            </div>
          </div>
          <div style="text-align:center;padding:20px 0 8px;font-size:11px;color:var(--m2)">FlowEX v2.0 · Hecho con ❤️</div>`;
};

window.applyTheme = (t, el) => {
    S.theme = t;
    document.body.className = t;
    scheduleSave();
    document.querySelectorAll('.tpi').forEach(x => x.classList.remove('sel'));
    if (el) el.classList.add('sel');
    toast('🎨 Tema aplicado', 'success');
};


// ── ADMIN PANEL (NULVEC only) ──────────────────
window.loadAdminData = async () => {
    if (!isCreator()) return;
    const listEl = document.getElementById('admin-users-list');
    const globEl = document.getElementById('admin-globals');
    if (!listEl) return;
    listEl.innerHTML = '<div style="text-align:center;padding:30px"><div class="admin-spin"></div><div style="font-size:13px;color:var(--m)">Cargando usuarios...</div></div>';
    try {
        const snap = await getDocs(collection(db, 'users'));
        const users = [];
        snap.forEach(d => {
            const data = d.data();
            if (d.id !== 'nulvec' || true) users.push({
                username: d.id,
                ...data
            });
        });
        // Sort by XP desc
        users.sort((a, b) => (b.xp || 0) - (a.xp || 0));

        // Global stats
        const totalUsers = users.length;
        const totalHabits = users.reduce((s, u) => s + (u.habits?.length || 0), 0);
        const totalLogs = users.reduce((s, u) => {
            const h = u.habits || [];
            return s + h.reduce((hs, hab) => hs + Object.values(hab.logs || {}).filter(Boolean).length, 0);
        }, 0);
        if (globEl) globEl.innerHTML = `
            <div class="global-stat"><div class="global-stat-val">${totalUsers}</div><div class="global-stat-lbl">Usuarios</div></div>
            <div class="global-stat"><div class="global-stat-val">${totalHabits}</div><div class="global-stat-lbl">Hábitos</div></div>
            <div class="global-stat"><div class="global-stat-val">${totalLogs}</div><div class="global-stat-lbl">Logs totales</div></div>`;

        // User cards
        if (!users.length) {
            listEl.innerHTML = '<div class="empty"><div class="ei">👥</div><div class="et">Sin usuarios</div></div>';
            return;
        }
        listEl.innerHTML = users.map(u => {
            const initial = (u.name || u.username || '?')[0].toUpperCase();
            const habits = u.habits || [];
            const td = new Date().toISOString().slice(0, 10);
            const doneToday = habits.filter(h => h.logs && h.logs[td]).length;
            const totalLogsU = habits.reduce((s, h) => s + Object.values(h.logs || {}).filter(Boolean).length, 0);
            const bestStreak = habits.reduce((best, h) => {
                let s = 0;
                for (let i = 0; i < 365; i++) {
                    const k = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
                    if (h.logs && h.logs[k]) s++;
                    else if (i > 0) break;
                }
                return Math.max(best, s);
            }, 0);
            const isThisCreator = u.username === 'nulvec';
            return `<div class="user-card">
              <div class="user-card-top">
                <div class="user-avatar" style="${isThisCreator?'background:linear-gradient(135deg,var(--a4),var(--a2))':''}">
                  ${isThisCreator?'👑':initial}
                </div>
                <div class="user-info">
                  <div class="user-name">
                    ${u.name||u.username}
                    ${isThisCreator?'<span class="creator-badge" style="margin-left:6px"><span class="creator-crown">👑</span> CREADOR</span>':''}
                  </div>
                  <div class="user-meta">@${u.username} · Nivel ${u.level||1} · ${u.xp||0} XP</div>
                </div>
              </div>
              <div class="user-stats-row">
                <div class="user-stat"><div class="user-stat-val">${habits.length}</div><div class="user-stat-lbl">Hábitos</div></div>
                <div class="user-stat"><div class="user-stat-val">${doneToday}/${habits.length}</div><div class="user-stat-lbl">Hoy</div></div>
                <div class="user-stat"><div class="user-stat-val">${bestStreak}🔥</div><div class="user-stat-lbl">Racha</div></div>
                <div class="user-stat"><div class="user-stat-val">${totalLogsU}</div><div class="user-stat-lbl">Logs</div></div>
              </div>
            </div>`;
        }).join('');
    } catch (e) {
        listEl.innerHTML = '<div class="empty"><div class="ei">⚠️</div><div class="et">Error al cargar</div><div class="ed">Revisá tu conexión o las reglas de Firestore.</div></div>';
        console.error(e);
    }
};

window.doLogout = () => {
    if (!confirm('¿Cerrar sesión?')) return;
    if (unsubSnapshot) unsubSnapshot();
    clearSession();
    CUR_USER = null;
    S = {
        name: '',
        theme: '',
        xp: 0,
        level: 1,
        habits: [],
        notes: [],
        curHF: 'todos'
    };
    document.body.className = '';
    loginPin = '';
    regPin = '';
    updatePinDisplay('login', '');
    updatePinDisplay('reg', '');
    document.getElementById('login-user').value = '';
    document.getElementById('login-err').textContent = '';
    document.getElementById('screen-app').classList.remove('active');
    document.getElementById('screen-app').style.display = 'none';
    document.getElementById('screen-auth').classList.add('active');
    document.getElementById('screen-auth').style.display = 'flex';
    switchAuthTab('login');
};

window.exportData = () => {
    const b = new Blob([JSON.stringify(S, null, 2)], {
        type: 'application/json'
    });
    const url = URL.createObjectURL(b);
    const a = document.createElement('a');
    a.href = url;
    a.download = `flowex-${CUR_USER}-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('📤 Datos exportados', 'success');
};

// ── IA ─────────────────────────────────────────────
let aiMentor = null;
const initIA = () => {
    const container = document.getElementById('ai-chat-container');
    if (!container) return;

    container.innerHTML = `
        <div class="ai-coming-soon">
            <div class="ai-coming-soon-icon">🤖</div>
            <h2>AI Mentor - Próximamente</h2>
            <p>El módulo de IA está deshabilitado temporalmente. Aquí estará disponible un asistente inteligente pronto.</p>
            <button class="btn-secondary" disabled>Disponible próximamente</button>
        </div>
    `;
};

// ── SMART NOTIFICATIONS ─────────────────────────────
let smartNotificationsManager = null;
const initSmartNotifications = () => {
    if (!smartNotificationsManager) {
        smartNotificationsManager = new SmartNotificationsManager();
    }
    smartNotificationsManager.init();
    renderNotifs();
    updateNotifIcon();
};

// ── COMMUNITY ───────────────────────────────────────
let communityManager = null;
const initCommunity = () => {
    if (!communityManager) {
        communityManager = new CommunityManager();
    }
    communityManager.init();
};

// ── UPDATES ─────────────────────────────────────────
let updatesManager = null;
const initUpdates = async () => {
    if (!updatesManager) {
        updatesManager = new UpdatesManager();
    }
    await updatesManager.init();
};

// ── TODO LIST ───────────────────────────────────────────
let todoListManager = null;
const initTodoList = async () => {
    if (!todoListManager) {
        todoListManager = new TodoListManager();
    }
    await todoListManager.init();
};

// ── LECTURA FUNCTIONS ──────────────────────────────
let editBookId = null;
window.openBookSheet = (id) => {
    editBookId = id || null;
    const b = id ? S.books.find(x => x.id === id) : null;
    document.getElementById('sh-book-title').textContent = b ? '✎ Editar libro' : '📖 Nuevo libro';
    document.getElementById('book-title').value = b ? b.title : '';
    document.getElementById('book-author').value = b ? b.author : '';
    document.getElementById('book-emoji').value = b ? b.emoji : '';
    document.getElementById('book-pages').value = b ? b.pages : '';
    document.getElementById('book-genre').value = b ? b.genre : '';
    document.getElementById('book-status').value = b ? b.status : 'backlog';
    const delBtn = document.getElementById('del-book-btn');
    if (delBtn) delBtn.style.display = b ? 'block' : 'none';
    document.getElementById('sh-book').classList.add('open');
};

window.saveBook = () => {
    const title = document.getElementById('book-title').value.trim();
    const author = document.getElementById('book-author').value.trim();
    if (!title || !author) {
        toast('Título y autor requeridos', 'error');
        return;
    }
    if (!S.books) S.books = [];
    const book = {
        id: editBookId || uid(),
        title,
        author,
        emoji: document.getElementById('book-emoji').value || '📚',
        pages: parseInt(document.getElementById('book-pages').value) || 0,
        curPage: 0,
        status: document.getElementById('book-status').value,
        genre: document.getElementById('book-genre').value || '',
        review: '',
        sessions: [],
        rating: 0,
        addedAt: today()
    };
    if (editBookId) {
        const idx = S.books.findIndex(b => b.id === editBookId);
        if (idx >= 0) {
            const existing = S.books[idx];
            S.books[idx] = {
                ...existing,
                title,
                author,
                emoji: document.getElementById('book-emoji').value || '📚',
                pages: parseInt(document.getElementById('book-pages').value) || existing.pages || 0,
                status: document.getElementById('book-status').value,
                genre: document.getElementById('book-genre').value || existing.genre || '',
                review: existing.review || '',
                sessions: existing.sessions || [],
                rating: existing.rating || 0,
                addedAt: existing.addedAt || today(),
                updatedAt: new Date().toISOString()
            };
        }
    } else {
        S.books.push(book);
    }
    scheduleSave();
    csh('sh-book');
    renderLectura();
    toast('Libro guardado!', 'success');
};

window.deleteBook = () => {
    if (!editBookId || !confirm('¿Eliminar este libro?')) return;
    S.books = S.books.filter(b => b.id !== editBookId);
    scheduleSave();
    csh('sh-book');
    renderLectura();
    toast('Libro eliminado', 'info');
};

// ── NOTIFS FUNCTIONS ───────────────────────────────
const NOTIF_CHECK_INTERVAL_MS = 60 * 1000;
let notifIntervalId = null;
let lastDailyNotifDate = null;
let lastUnmarkedNotifDate = null;

const showNotification = async (title, options = {}) => {
    if (!('Notification' in window)) return;
    try {
        if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration();
            if (reg && reg.showNotification) {
                return reg.showNotification(title, options);
            }
        }
        return new Notification(title, options);
    } catch (e) {
        console.warn('No se puede mostrar notificación:', e);
    }
};

const requestNotificationsPermission = async () => {
    if (!('Notification' in window)) {
        toast('Notificaciones no disponibles en este navegador', 'error');
        return false;
    }
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') {
        toast('Permiso de notificaciones denegado. Activalo en la configuración del navegador.', 'error');
        return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
        toast('No se otorgó permiso para recibir recordatorios.', 'warn');
        return false;
    }
    toast('Notificaciones activadas. ¡Recibirás recordatorios!', 'success');
    return true;
};

const checkNotificationsDue = () => {
    if (!S.notifSettings || !S.notifSettings.enabled) return;
    if (Notification.permission !== 'granted') return;

    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const [hour, minute] = (S.notifSettings.dailySummary || '21:00').split(':').map(Number);

    if (Number.isInteger(hour) && Number.isInteger(minute)) {
        const target = new Date(now);
        target.setHours(hour, minute, 0, 0);
        const diff = now - target;

        if (diff >= 0 && diff < NOTIF_CHECK_INTERVAL_MS && lastDailyNotifDate !== todayKey) {
            lastDailyNotifDate = todayKey;
            const total = S.habits ? S.habits.length : 0;
            const done = S.habits ? S.habits.filter(h => h.logs && h.logs[todayKey]).length : 0;
            showNotification('FlowEX: Resumen diario', {
                body: `Completaste ${done}/${total} hábitos hoy.
      ${S.notifSettings.remindUnmarked ? 'Revisá hábitos sin marcar.' : ''}`.trim(),
                icon: './icon-192.png'
            });
        }
    }

    if (S.notifSettings.remindUnmarked && lastUnmarkedNotifDate !== todayKey) {
        const unmarked = S.habits ? S.habits.filter(h => !(h.logs && h.logs[todayKey])).length : 0;
        if (unmarked > 0 && now.getHours() === 21 && now.getMinutes() === 0) {
            lastUnmarkedNotifDate = todayKey;
            showNotification('FlowEX: Hábitos sin marcar', {
                body: `Quedan ${unmarked} hábito${unmarked===1?'':'s'} por marcar. ¡Todavía podés cerrar el día!`,
                icon: './icon-192.png'
            });
        }
    }

    // Per-habit reminders
    if (S.habits) {
        S.habits.forEach(h => {
            if (h.reminder && !(h.logs && h.logs[todayKey])) {
                const [rHour, rMin] = h.reminder.split(':').map(Number);
                if (Number.isInteger(rHour) && Number.isInteger(rMin) && now.getHours() === rHour && now.getMinutes() === rMin) {
                    showNotification(`FlowEX: ${h.emoji} ${h.name}`, {
                        body: '¿Completaste este hábito hoy?',
                        icon: './icon-192.png'
                    });
                }
            }
        });
    }
};

const scheduleNotifications = () => {
    clearInterval(notifIntervalId);
    notifIntervalId = null;
    if (!S.notifSettings || !S.notifSettings.enabled || Notification.permission !== 'granted') return;
    checkNotificationsDue();
    notifIntervalId = setInterval(checkNotificationsDue, NOTIF_CHECK_INTERVAL_MS);
};

window.toggleNotifs = async () => {
    if (!S.notifSettings) S.notifSettings = {
        enabled: false,
        habits: {},
        dailySummary: '21:00',
        remindUnmarked: true
    };
    if (!S.notifSettings.enabled) {
        const granted = await requestNotificationsPermission();
        if (!granted) {
            S.notifSettings.enabled = false;
            scheduleSave();
            renderNotifs();
            return;
        }
        S.notifSettings.enabled = true;
        lastDailyNotifDate = null;
        lastUnmarkedNotifDate = null;
        scheduleNotifications();
    } else {
        S.notifSettings.enabled = false;
        clearInterval(notifIntervalId);
        notifIntervalId = null;
        toast('Notificaciones desactivadas', 'info');
    }
    scheduleSave();
    renderNotifs();
};

// ── SEARCH ──────────────────────────────────────────
let searchTimeout = null;

window.openSearch = () => {
    document.getElementById('sh-search').classList.add('open');
    document.getElementById('search-input').focus();
    performSearch();
};

window.performSearch = () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        const query = document.getElementById('search-input').value.toLowerCase().trim();
        const resultsEl = document.getElementById('search-results');
        if (!query) {
            resultsEl.innerHTML = '<div class="empty"><div class="ei">🔍</div><div class="et">Escribí algo para buscar</div></div>';
            return;
        }
        let results = [];

        // Search habits
        if (S.habits) {
            S.habits.forEach(h => {
                if (h.name.toLowerCase().includes(query) || (h.goal && h.goal.toLowerCase().includes(query))) {
                    results.push({
                        type: 'habito',
                        icon: h.emoji,
                        title: h.name,
                        desc: h.goal || 'Sin descripción',
                        action: `gp('habitos')`
                    });
                }
            });
        }

        // Search tasks
        if (S.tasks) {
            S.tasks.forEach(t => {
                if (t.name.toLowerCase().includes(query)) {
                    results.push({
                        type: 'tarea',
                        icon: '✅',
                        title: t.name,
                        desc: t.done ? 'Completada' : 'Pendiente',
                        action: `gp('tareas')`
                    });
                }
            });
        }

        // Search notes
        if (S.notes) {
            S.notes.forEach(n => {
                if (n.title.toLowerCase().includes(query) || n.body.toLowerCase().includes(query)) {
                    results.push({
                        type: 'nota',
                        icon: '📝',
                        title: n.title,
                        desc: n.body.substring(0, 50) + (n.body.length > 50 ? '...' : ''),
                        action: `gp('notas')`
                    });
                }
            });
        }

        // Search goals
        if (S.goals) {
            S.goals.forEach(g => {
                if (g.name.toLowerCase().includes(query) || (g.desc && g.desc.toLowerCase().includes(query))) {
                    results.push({
                        type: 'meta',
                        icon: '🎯',
                        title: g.name,
                        desc: g.desc || 'Sin descripción',
                        action: `gp('metas')`
                    });
                }
            });
        }

        if (!results.length) {
            resultsEl.innerHTML = '<div class="empty"><div class="ei">😔</div><div class="et">No se encontraron resultados</div></div>';
            return;
        }

        resultsEl.innerHTML = results.map(r => `
            <div class="search-result" onclick="${r.action}">
                <div class="sr-icon">${r.icon}</div>
                <div class="sr-content">
                    <div class="sr-title">${r.title}</div>
                    <div class="sr-desc">${r.desc}</div>
                    <div class="sr-type">${r.type}</div>
                </div>
            </div>
        `).join('');
    }, 300);
};

// ── UI HELPERS ─────────────────────────────────────
window.csh = (id, event) => {
    if (event && event.target !== document.getElementById(id)) return;
    const el = document.getElementById(id);
    if (el) el.classList.remove('open');
};

window.toast = (msg, type = 'info') => {
    const tc = document.getElementById('tc');
    if (!tc) return;
    const t = document.createElement('div');
    const cols = {
        success: 'var(--a3)',
        warn: 'var(--a4)',
        error: 'var(--a2)',
        info: 'var(--a)'
    };
    t.className = 'toast';
    t.style.borderColor = cols[type] || 'var(--b)';
    t.textContent = msg;
    tc.appendChild(t);
    setTimeout(() => {
        t.style.opacity = '0';
        t.style.transition = 'opacity .3s';
        setTimeout(() => t.remove(), 300);
    }, 2800);
};

// Show update banner notifications
window.showUpdateBanner = (title, message, action = null, actionLabel = 'Ver') => {
    const container = document.getElementById('updates-notifications-container');
    if (!container) return;

    const banner = document.createElement('div');
    banner.className = 'updates-banner';
    banner.innerHTML = `
        <div class="updates-banner-title">${title}</div>
        <div class="updates-banner-text">${message}</div>
        <div class="updates-banner-actions">
            <button class="updates-banner-btn" onclick="this.closest('.updates-banner').remove()">Descartar</button>
            ${action ? `<button class="updates-banner-btn primary" onclick="gp('${action}'); this.closest('.updates-banner').remove()">${actionLabel}</button>` : ''}
        </div>
    `;
    
    container.appendChild(banner);
    
    // Auto-dismiss after 8 seconds
    setTimeout(() => {
        if (banner.remove) banner.remove();
    }, 8000);
};

window.confetti = () => {
    const div = document.createElement('div');
    div.className = 'confetti-wrap';
    document.body.appendChild(div);
    const cols = ['#7c6dfa', '#fa6d8f', '#6dfac4', '#fac46d', '#60a5fa'];
    for (let i = 0; i < 20; i++) {
        const p = document.createElement('div');
        p.className = 'cf';
        p.style.cssText = `left:${15+Math.random()*70}%;background:${cols[i%5]};animation-delay:${Math.random()*.4}s;animation-duration:${.9+Math.random()*.5}s;border-radius:${Math.random()>.5?'50%':'2px'}`;
        div.appendChild(p);
    }
    setTimeout(() => div.remove(), 1700);
};

// ── MÓDULO: MINDFULNESS 🧘 ───────────────────────────
let breathInterval = null;
let breathPhase = 0; // 0: inhale, 1: hold, 2: exhale
let breathTime = 0;
let meditationTimer = null;
let meditationTime = 0;

window.renderMindfulness = () => {
    if (!S.mindfulness) S.mindfulness = { sessions: [], totalTime: 0 };
    const statsEl = document.getElementById('mindfulness-stats');
    if (statsEl) {
        const totalSessions = S.mindfulness.sessions.length;
        const totalTime = S.mindfulness.totalTime || 0;
        const avgTime = totalSessions > 0 ? Math.round(totalTime / totalSessions) : 0;
        statsEl.innerHTML = `
            <div class="stat-item">
                <div class="stat-val">${totalSessions}</div>
                <div class="stat-lbl">Sesiones</div>
            </div>
            <div class="stat-item">
                <div class="stat-val">${Math.floor(totalTime / 60)}min</div>
                <div class="stat-lbl">Tiempo total</div>
            </div>
            <div class="stat-item">
                <div class="stat-val">${avgTime}min</div>
                <div class="stat-lbl">Promedio</div>
            </div>
        `;
    }
};

window.startBreath = () => {
    const circle = document.getElementById('breath-circle');
    const instr = document.getElementById('breath-instr');
    const startBtn = document.getElementById('breath-start');
    const stopBtn = document.getElementById('breath-stop');
    if (breathInterval) return;
    startBtn.style.display = 'none';
    stopBtn.style.display = 'block';
    breathPhase = 0;
    breathTime = 0;
    instr.textContent = 'Inhalá';
    circle.style.transform = 'scale(1)';
    breathInterval = setInterval(() => {
        breathTime++;
        if (breathPhase === 0 && breathTime >= 4) { // inhale 4s
            instr.textContent = 'Retené';
            breathPhase = 1;
            breathTime = 0;
        } else if (breathPhase === 1 && breathTime >= 7) { // hold 7s
            instr.textContent = 'Exhalá';
            circle.style.transform = 'scale(0.5)';
            breathPhase = 2;
            breathTime = 0;
        } else if (breathPhase === 2 && breathTime >= 8) { // exhale 8s
            instr.textContent = 'Inhalá';
            circle.style.transform = 'scale(1)';
            breathPhase = 0;
            breathTime = 0;
        }
    }, 1000);
};

window.stopBreath = () => {
    const startBtn = document.getElementById('breath-start');
    const stopBtn = document.getElementById('breath-stop');
    const instr = document.getElementById('breath-instr');
    const circle = document.getElementById('breath-circle');
    clearInterval(breathInterval);
    breathInterval = null;
    startBtn.style.display = 'block';
    stopBtn.style.display = 'none';
    instr.textContent = 'Inhalá';
    circle.style.transform = 'scale(1)';
};

window.startMeditation = (minutes) => {
    if (meditationTimer) return;
    meditationTime = minutes * 60;
    const timerEl = document.createElement('div');
    timerEl.id = 'meditation-timer';
    timerEl.className = 'meditation-timer';
    timerEl.innerHTML = `
        <div class="med-timer-circle">
            <div class="med-timer-text" id="med-timer-text">${minutes}:00</div>
        </div>
        <button class="med-stop-btn" onclick="stopMeditation()">Detener</button>
    `;
    document.body.appendChild(timerEl);
    meditationTimer = setInterval(() => {
        meditationTime--;
        const min = Math.floor(meditationTime / 60);
        const sec = meditationTime % 60;
        document.getElementById('med-timer-text').textContent = `${min}:${sec.toString().padStart(2, '0')}`;
        if (meditationTime <= 0) {
            stopMeditation();
            toast('¡Sesión completada! 🧘', 'success');
            // Save session
            if (!S.mindfulness) S.mindfulness = { sessions: [], totalTime: 0 };
            S.mindfulness.sessions.push({
                date: today(),
                duration: minutes
            });
            S.mindfulness.totalTime = (S.mindfulness.totalTime || 0) + minutes;
            scheduleSave();
            renderMindfulness();
        }
    }, 1000);
};

window.stopMeditation = () => {
    clearInterval(meditationTimer);
    meditationTimer = null;
    const timerEl = document.getElementById('meditation-timer');
    if (timerEl) timerEl.remove();
};

// ── JOURNAL MANAGER ──────────────────────────────────
// JournalManager.js - Diario personal y reflexiones
class JournalManager {
    constructor() {
        this.entries = [];
        this.currentEntry = null;
    }

    // Inicializar desde storage
    async init() {
        const data = await idbGet('journal') || [];
        this.entries = data;
        this.renderJournal();
    }

    // Crear entrada de diario
    createEntry(data) {
        const entry = {
            id: uid(),
            date: data.date || today(),
            title: data.title || '',
            content: data.content || '',
            mood: data.mood || 'neutral',
            tags: data.tags || [],
            weather: data.weather || '',
            location: data.location || '',
            created: Date.now(),
            updated: Date.now()
        };
        this.entries.push(entry);
        this.save();
        this.renderJournal();
        return entry;
    }

    // Actualizar entrada
    updateEntry(id, updates) {
        const entry = this.entries.find(e => e.id === id);
        if (entry) {
            Object.assign(entry, updates, { updated: Date.now() });
            this.save();
            this.renderJournal();
        }
    }

    // Eliminar entrada
    deleteEntry(id) {
        this.entries = this.entries.filter(e => e.id !== id);
        this.save();
        this.renderJournal();
    }

    // Guardar a storage
    async save() {
        await idbSet('journal', this.entries);
    }

    // Renderizar lista de entradas
    renderJournal() {
        const container = document.getElementById('journal-list');
        if (!container) return;

        // Ordenar por fecha descendente
        const sortedEntries = this.entries.sort((a, b) => new Date(b.date) - new Date(a.date));

        container.innerHTML = sortedEntries.map(entry => `
            <div class="journal-entry" data-id="${entry.id}" onclick="journalManager.selectEntry('${entry.id}')">
                <div class="entry-header">
                    <div class="entry-date">${dateLabel(entry.date)}</div>
                    <div class="entry-mood mood-${entry.mood}">${this.getMoodEmoji(entry.mood)}</div>
                </div>
                <h3 class="entry-title">${entry.title || 'Sin título'}</h3>
                <p class="entry-preview">${this.getPreview(entry.content)}</p>
                ${entry.tags.length ? `<div class="entry-tags">${entry.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}</div>` : ''}
            </div>
        `).join('');

        // Actualizar contador
        const countEl = document.getElementById('journal-count');
        if (countEl) countEl.textContent = this.entries.length;
    }

    // Obtener emoji del estado de ánimo
    getMoodEmoji(mood) {
        const moods = {
            excellent: '😊',
            good: '🙂',
            neutral: '😐',
            bad: '😞',
            terrible: '😢'
        };
        return moods[mood] || '😐';
    }

    // Obtener preview del contenido
    getPreview(content) {
        if (!content) return 'Sin contenido';
        return content.length > 100 ? content.substring(0, 100) + '...' : content;
    }

    // Seleccionar entrada
    selectEntry(id) {
        this.currentEntry = this.entries.find(e => e.id === id);
        this.renderEntryDetail(id);
    }

    // Renderizar detalle de entrada
    renderEntryDetail(id) {
        const entry = this.entries.find(e => e.id === id);
        if (!entry) return;

        const container = document.getElementById('journal-detail');
        if (!container) return;

        container.innerHTML = `
            <div class="entry-detail-header">
                <div class="entry-nav">
                    <button class="btn-secondary" onclick="journalManager.backToJournal()">← Volver</button>
                </div>
                <div class="entry-actions">
                    <button class="btn-secondary" onclick="journalManager.editEntry('${entry.id}')">Editar</button>
                    <button class="btn-danger" onclick="journalManager.deleteEntry('${entry.id}')">Eliminar</button>
                </div>
            </div>

            <div class="entry-content">
                <div class="entry-meta">
                    <div class="entry-date-large">${dateLabel(entry.date)}</div>
                    <div class="entry-mood-large mood-${entry.mood}">${this.getMoodEmoji(entry.mood)} ${entry.mood}</div>
                    ${entry.weather ? `<div class="entry-weather">${entry.weather}</div>` : ''}
                    ${entry.location ? `<div class="entry-location">📍 ${entry.location}</div>` : ''}
                </div>

                <h1 class="entry-title-large">${entry.title || 'Sin título'}</h1>

                <div class="entry-body">${this.formatContent(entry.content)}</div>

                ${entry.tags.length ? `<div class="entry-tags-large">${entry.tags.map(tag => `<span class="tag-large">${tag}</span>`).join('')}</div>` : ''}
            </div>
        `;

        // Mostrar sección de detalles
        document.getElementById('journal-overview').style.display = 'none';
        document.getElementById('journal-detail').style.display = 'block';
    }

    // Formatear contenido con saltos de línea
    formatContent(content) {
        if (!content) return '<p>Sin contenido</p>';
        return content.split('\n').map(line => `<p>${line || '&nbsp;'}</p>`).join('');
    }

    // Mostrar formulario para nueva entrada
    showNewEntry() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Nueva entrada de diario</h3>
                <form onsubmit="journalManager.createEntryForm(event)">
                    <input type="date" name="date" value="${today()}" required>
                    <input type="text" name="title" placeholder="Título (opcional)">
                    <select name="mood">
                        <option value="excellent">Excelente 😊</option>
                        <option value="good" selected>Bueno 🙂</option>
                        <option value="neutral">Neutral 😐</option>
                        <option value="bad">Malo 😞</option>
                        <option value="terrible">Terrible 😢</option>
                    </select>
                    <textarea name="content" placeholder="¿Qué pasó hoy? ¿Cómo te sientes? ¿Qué aprendiste?" rows="8" required></textarea>
                    <input type="text" name="weather" placeholder="Clima (opcional)">
                    <input type="text" name="location" placeholder="Ubicación (opcional)">
                    <input type="text" name="tags" placeholder="Etiquetas separadas por coma (opcional)">
                    <div class="modal-actions">
                        <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button type="submit" class="btn-primary">Guardar</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Manejar formulario de creación
    createEntryForm(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const tags = formData.get('tags') ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t) : [];
        this.createEntry({
            date: formData.get('date'),
            title: formData.get('title'),
            content: formData.get('content'),
            mood: formData.get('mood'),
            weather: formData.get('weather'),
            location: formData.get('location'),
            tags: tags
        });
        event.target.closest('.modal-overlay').remove();
    }

    // Volver a la lista
    backToJournal() {
        document.getElementById('journal-overview').style.display = 'block';
        document.getElementById('journal-detail').style.display = 'none';
        this.currentEntry = null;
    }

    // Estadísticas del diario
    getStats() {
        const total = this.entries.length;
        const thisMonth = this.entries.filter(e => e.date.startsWith(today().slice(0, 7))).length;
        const avgMood = this.calculateAverageMood();
        const streak = this.calculateStreak();

        return { total, thisMonth, avgMood, streak };
    }

    // Calcular estado de ánimo promedio
    calculateAverageMood() {
        if (this.entries.length === 0) return 'neutral';

        const moodValues = { excellent: 5, good: 4, neutral: 3, bad: 2, terrible: 1 };
        const total = this.entries.reduce((sum, e) => sum + (moodValues[e.mood] || 3), 0);
        const avg = total / this.entries.length;

        if (avg >= 4.5) return 'excellent';
        if (avg >= 3.5) return 'good';
        if (avg >= 2.5) return 'neutral';
        if (avg >= 1.5) return 'bad';
        return 'terrible';
    }

    // Calcular racha de días consecutivos
    calculateStreak() {
        if (this.entries.length === 0) return 0;

        const sortedDates = [...new Set(this.entries.map(e => e.date))].sort();
        let streak = 0;
        let currentStreak = 0;
        let lastDate = null;

        for (const date of sortedDates) {
            const current = new Date(date);
            if (lastDate) {
                const diff = (current - lastDate) / (1000 * 60 * 60 * 24);
                if (diff === 1) {
                    currentStreak++;
                } else {
                    currentStreak = 1;
                }
            } else {
                currentStreak = 1;
            }
            streak = Math.max(streak, currentStreak);
            lastDate = current;
        }

        return streak;
    }
}

// Instancia global
const journalManager = new JournalManager();

// ── TIME TRACKER MANAGER ──────────────────────────────────
// TimeTrackerManager.js - Seguimiento detallado de tiempo
class TimeTrackerManager {
    constructor() {
        this.sessions = [];
        this.currentSession = null;
        this.timer = null;
        this.startTime = null;
    }

    // Inicializar desde storage
    async init() {
        const data = await idbGet('timeSessions') || [];
        this.sessions = data;
        this.renderTimeTracker();
        this.updateStats();
    }

    // Iniciar sesión de tiempo
    startSession(data) {
        if (this.currentSession) {
            this.stopSession();
        }

        this.currentSession = {
            id: uid(),
            taskId: data.taskId,
            projectId: data.projectId,
            description: data.description || '',
            startTime: Date.now(),
            endTime: null,
            duration: 0,
            tags: data.tags || [],
            billable: data.billable || false
        };

        this.startTime = Date.now();
        this.startTimer();
        this.save();
        this.renderTimeTracker();
    }

    // Detener sesión actual
    stopSession() {
        if (!this.currentSession) return;

        this.currentSession.endTime = Date.now();
        this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;

        this.sessions.push(this.currentSession);
        this.currentSession = null;
        this.stopTimer();
        this.save();
        this.renderTimeTracker();
        this.updateStats();
    }

    // Pausar/reanudar
    togglePause() {
        if (!this.currentSession) return;

        if (this.timer) {
            this.stopTimer();
        } else {
            this.startTimer();
        }
    }

    // Iniciar timer
    startTimer() {
        this.timer = setInterval(() => {
            this.updateDisplay();
        }, 1000);
        this.updateDisplay();
    }

    // Detener timer
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // Actualizar display del timer
    updateDisplay() {
        if (!this.currentSession) return;

        const elapsed = Date.now() - this.startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        const display = document.getElementById('timer-display');
        if (display) {
            display.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    // Guardar a storage
    async save() {
        await idbSet('timeSessions', this.sessions);
    }

    // Renderizar interfaz
    renderTimeTracker() {
        this.renderCurrentSession();
        this.renderSessionsList();
    }

    // Renderizar sesión actual
    renderCurrentSession() {
        const container = document.getElementById('current-session');
        if (!container) return;

        if (this.currentSession) {
            container.innerHTML = `
                <div class="current-session-active">
                    <div class="session-info">
                        <h3>${this.currentSession.description || 'Sesión activa'}</h3>
                        <div class="session-timer" id="timer-display">00:00:00</div>
                    </div>
                    <div class="session-controls">
                        <button class="btn-secondary" onclick="timeTrackerManager.togglePause()">
                            ${this.timer ? '⏸️ Pausar' : '▶️ Reanudar'}
                        </button>
                        <button class="btn-danger" onclick="timeTrackerManager.stopSession()">
                            ⏹️ Detener
                        </button>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="current-session-inactive">
                    <div class="session-start">
                        <input type="text" id="session-description" placeholder="¿En qué vas a trabajar?">
                        <button class="btn-primary" onclick="timeTrackerManager.startNewSession()">
                            ▶️ Iniciar
                        </button>
                    </div>
                </div>
            `;
        }
    }

    // Iniciar nueva sesión desde input
    startNewSession() {
        const description = document.getElementById('session-description').value.trim();
        if (!description) return;

        this.startSession({ description });
        document.getElementById('session-description').value = '';
    }

    // Renderizar lista de sesiones
    renderSessionsList() {
        const container = document.getElementById('sessions-list');
        if (!container) return;

        // Mostrar últimas 10 sesiones
        const recentSessions = this.sessions.slice(-10).reverse();

        container.innerHTML = recentSessions.map(session => `
            <div class="session-item">
                <div class="session-item-info">
                    <h4>${session.description}</h4>
                    <div class="session-meta">
                        <span>${new Date(session.startTime).toLocaleDateString()}</span>
                        <span>${this.formatDuration(session.duration)}</span>
                        ${session.tags.length ? `<span class="session-tags">${session.tags.join(', ')}</span>` : ''}
                    </div>
                </div>
                <div class="session-item-actions">
                    <button class="btn-small" onclick="timeTrackerManager.editSession('${session.id}')">✏️</button>
                    <button class="btn-small danger" onclick="timeTrackerManager.deleteSession('${session.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    // Formatear duración
    formatDuration(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m ${seconds}s`;
        }
    }

    // Eliminar sesión
    deleteSession(id) {
        this.sessions = this.sessions.filter(s => s.id !== id);
        this.save();
        this.renderTimeTracker();
        this.updateStats();
    }

    // Actualizar estadísticas
    updateStats() {
        const stats = this.calculateStats();

        const totalEl = document.getElementById('time-total');
        const todayEl = document.getElementById('time-today');
        const weekEl = document.getElementById('time-week');

        if (totalEl) totalEl.textContent = this.formatDuration(stats.total);
        if (todayEl) todayEl.textContent = this.formatDuration(stats.today);
        if (weekEl) weekEl.textContent = this.formatDuration(stats.week);
    }

    // Calcular estadísticas
    calculateStats() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());

        let total = 0;
        let todayTotal = 0;
        let weekTotal = 0;

        this.sessions.forEach(session => {
            const sessionDate = new Date(session.startTime);
            total += session.duration;

            if (sessionDate >= today) {
                todayTotal += session.duration;
            }

            if (sessionDate >= weekStart) {
                weekTotal += session.duration;
            }
        });

        return { total, today: todayTotal, week: weekTotal };
    }

    // Mostrar formulario para editar sesión
    editSession(id) {
        const session = this.sessions.find(s => s.id === id);
        if (!session) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Editar sesión</h3>
                <form onsubmit="timeTrackerManager.updateSessionForm(event, '${id}')">
                    <input type="text" name="description" value="${session.description}" required>
                    <input type="text" name="tags" value="${session.tags.join(', ')}" placeholder="Etiquetas separadas por coma">
                    <label>
                        <input type="checkbox" name="billable" ${session.billable ? 'checked' : ''}>
                        Facturable
                    </label>
                    <div class="modal-actions">
                        <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button type="submit" class="btn-primary">Guardar</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Actualizar sesión desde formulario
    updateSessionForm(event, id) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const session = this.sessions.find(s => s.id === id);
        if (session) {
            session.description = formData.get('description');
            session.tags = formData.get('tags') ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t) : [];
            session.billable = formData.has('billable');
            this.save();
            this.renderTimeTracker();
        }
        event.target.closest('.modal-overlay').remove();
    }

    // Exportar datos
    exportData() {
        const data = {
            sessions: this.sessions,
            exportDate: new Date().toISOString(),
            totalTime: this.calculateStats().total
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `time-tracking-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Instancia global
const timeTrackerManager = new TimeTrackerManager();

// ── SEARCH MANAGER ──────────────────────────────────
// SearchManager.js - Búsqueda global en toda la app
class SearchManager {
    constructor() {
        this.results = [];
        this.currentQuery = '';
    }

    // Inicializar
    init() {
        this.renderSearch();
    }

    // Realizar búsqueda
    async search(query) {
        if (!query.trim()) {
            this.results = [];
            this.renderResults();
            return;
        }

        this.currentQuery = query.toLowerCase();
        this.results = [];

        // Buscar en tareas
        const tasks = S.tasks || [];
        tasks.forEach(task => {
            if (this.matches(task.title) || this.matches(task.time) || this.matches(task.notes)) {
                this.results.push({
                    type: 'task',
                    id: task.id,
                    title: task.title,
                    content: this.getPreview(task.notes || task.time || ''),
                    category: 'Tareas',
                    icon: '✅',
                    action: "gp('tareas')"
                });
            }
        });

        // Buscar en hábitos
        const habits = S.habits || [];
        habits.forEach(habit => {
            if (this.matches(habit.name) || this.matches(habit.area) || this.matches(habit.description)) {
                this.results.push({
                    type: 'habit',
                    id: habit.id,
                    title: habit.name,
                    content: this.getPreview(habit.area || habit.description || ''),
                    category: 'Hábitos',
                    icon: '🔥',
                    action: "gp('habitos')"
                });
            }
        });

        // Buscar en notas
        const notes = S.notes || [];
        notes.forEach(note => {
            if (this.matches(note.title) || this.matches(note.body) || this.matches(note.tags?.join(' ')) || this.matches(note.folder)) {
                this.results.push({
                    type: 'note',
                    id: note.id,
                    title: note.title || 'Nota sin título',
                    content: this.getPreview(note.body || ''),
                    category: 'Notas',
                    icon: '📝',
                    action: "gp('notas')"
                });
            }
        });



        // Buscar en diario (si existe)
        try {
            const journal = await idbGet('journal') || [];
            journal.forEach(entry => {
                const tags = entry.tags || [];
                if (this.matches(entry.title) || this.matches(entry.content) || tags.some(tag => this.matches(tag))) {
                    this.results.push({
                        type: 'journal',
                        id: entry.id,
                        title: entry.title || 'Sin título',
                        content: this.getPreview(entry.content),
                        category: 'Diario',
                        icon: '📖',
                        action: "gp('notas')"
                    });
                }
            });
        } catch (e) {}

        this.renderResults();
    }

    // Verificar si el texto coincide con la búsqueda
    matches(text) {
        return text && text.toLowerCase().includes(this.currentQuery);
    }

    // Obtener preview del texto
    getPreview(text) {
        if (!text) return '';
        const maxLength = 100;
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    // Renderizar interfaz de búsqueda
    renderSearch() {
        const container = document.getElementById('search-container');
        if (!container) return;

        container.innerHTML = `
            <div class="search-input-container">
                <input type="text" id="global-search" placeholder="Buscar en toda la app..." class="search-input">
                <button class="search-btn" onclick="searchManager.search(document.getElementById('global-search').value)">🔍</button>
            </div>
            <div id="search-results" class="search-results">
                <!-- Results will be rendered here -->
            </div>
        `;

        // Event listener para búsqueda en tiempo real
        const input = document.getElementById('global-search');
        let timeout;
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.search(input.value);
            }, 300);
        });
    }

    // Renderizar resultados
    renderResults() {
        const container = document.getElementById('search-results');
        if (!container) return;

        if (this.results.length === 0 && this.currentQuery) {
            container.innerHTML = '<div class="search-empty">No se encontraron resultados</div>';
            return;
        }

        if (this.results.length === 0) {
            container.innerHTML = '<div class="search-empty">Escribe algo para buscar</div>';
            return;
        }

        // Agrupar por categoría
        const grouped = this.results.reduce((acc, result) => {
            if (!acc[result.category]) acc[result.category] = [];
            acc[result.category].push(result);
            return acc;
        }, {});

        container.innerHTML = Object.entries(grouped).map(([category, items]) => `
            <div class="search-category">
                <h4>${category}</h4>
                ${items.map(item => `
                    <div class="search-item" onclick="${item.action}">
                        <div class="search-item-icon">${item.icon}</div>
                        <div class="search-item-content">
                            <div class="search-item-title">${this.highlightMatches(item.title)}</div>
                            <div class="search-item-preview">${this.highlightMatches(item.content)}</div>
                        </div>
                        <button class="search-action" onclick="event.stopPropagation(); ${item.action}">Ir</button>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    // Resaltar coincidencias en el texto
    highlightMatches(text) {
        if (!text || !this.currentQuery) return text;
        const regex = new RegExp(`(${this.currentQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    // Limpiar búsqueda
    clear() {
        this.results = [];
        this.currentQuery = '';
        const input = document.getElementById('global-search');
        if (input) input.value = '';
        this.renderResults();
    }
}

// Instancia global
const searchManager = new SearchManager();

// ── AI MENTOR MANAGER ──────────────────────────────────
// AIMentor.js - Asistente de IA para productividad
class AIMentor {
    constructor() {
        this.conversation = [];
        this.isTyping = false;
    }

    // Inicializar
    init() {
        this.renderAIInterface();
        this.loadConversation();
    }

    // Renderizar interfaz de IA
    renderAIInterface() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="ai-header">
                <div class="ai-avatar">🤖</div>
                <div class="ai-info">
                    <h3>AI Mentor</h3>
                    <p>Asistente de productividad personal</p>
                </div>
                <div class="ai-status" id="ai-status">En línea</div>
            </div>

            <div class="ai-chat-messages" id="ai-messages">
                <div class="ai-message ai-message-bot">
                    <div class="ai-message-avatar">🤖</div>
                    <div class="ai-message-content">
                        ¡Hola! Soy tu asistente de productividad. Puedo ayudarte con:
                        <ul>
                            <li>💡 Sugerencias para mejorar tu productividad</li>
                            <li>📊 Análisis de tus hábitos y patrones</li>
                            <li>🎯 Recomendaciones personalizadas</li>
                            <li>❓ Respuestas a tus preguntas</li>
                        </ul>
                        ¿En qué puedo ayudarte hoy?
                    </div>
                </div>
            </div>

            <div class="ai-quick-actions">
                <button class="ai-quick-btn" onclick="aiMentor.quickAction('analyze')">📊 Analizar mi día</button>
                <button class="ai-quick-btn" onclick="aiMentor.quickAction('suggest')">💡 Sugerencias</button>
                <button class="ai-quick-btn" onclick="aiMentor.quickAction('motivate')">⚡ Motivación</button>
                <button class="ai-quick-btn" onclick="aiMentor.quickAction('plan')">📅 Planificar</button>
            </div>

            <div class="ai-input-container">
                <input type="text" id="ai-input" placeholder="Pregúntame algo..." class="ai-input">
                <button class="ai-send-btn" onclick="aiMentor.sendMessage()">📤</button>
            </div>
        `;

        // Event listeners
        const input = document.getElementById('ai-input');
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    // Enviar mensaje
    async sendMessage() {
        const input = document.getElementById('ai-input');
        const message = input.value.trim();
        if (!message || this.isTyping) return;

        // Añadir mensaje del usuario
        this.addMessage('user', message);
        input.value = '';

        // Mostrar typing indicator
        this.showTyping();

        // Procesar mensaje
        const response = await this.processMessage(message);

        // Ocultar typing y mostrar respuesta
        this.hideTyping();
        this.addMessage('bot', response);

        // Guardar conversación
        this.saveConversation();
    }

    // Procesar mensaje y generar respuesta
    async processMessage(message) {
        const lowerMessage = message.toLowerCase();

        // Análisis de patrones comunes
        if (lowerMessage.includes('analiz') || lowerMessage.includes('cómo estoy')) {
            return await this.analyzeProductivity();
        }

        if (lowerMessage.includes('sugerenc') || lowerMessage.includes('mejorar')) {
            return await this.generateSuggestions();
        }

        if (lowerMessage.includes('motiv') || lowerMessage.includes('ánimo')) {
            return this.getMotivation();
        }

        if (lowerMessage.includes('plan') || lowerMessage.includes('organizar')) {
            return await this.generatePlan();
        }

        if (lowerMessage.includes('hábit') || lowerMessage.includes('rutina')) {
            return await this.analyzeHabits();
        }

        if (lowerMessage.includes('tarea') || lowerMessage.includes('pendiente')) {
            return await this.analyzeTasks();
        }

        if (lowerMessage.includes('tiempo') || lowerMessage.includes('horas')) {
            return await this.analyzeTime();
        }

        // Respuestas genéricas
        if (lowerMessage.includes('hola') || lowerMessage.includes('hi')) {
            return "¡Hola! ¿En qué puedo ayudarte con tu productividad hoy?";
        }

        if (lowerMessage.includes('gracias') || lowerMessage.includes('thanks')) {
            return "¡De nada! Estoy aquí para ayudarte a ser más productivo. ¿Algo más?";
        }

        // Respuesta por defecto
        return await this.generateGenericResponse(message);
    }

    // Análisis de productividad
    async analyzeProductivity() {
        const stats = this.getProductivityStats();

        let analysis = "📊 **Análisis de tu productividad:**\n\n";

        if (stats.tasksCompleted > 0) {
            analysis += `✅ Has completado ${stats.tasksCompleted} tareas esta semana\n`;
        }

        if (stats.habitsStreak > 0) {
            analysis += `🔥 Tienes ${stats.habitsStreak} días de racha en hábitos\n`;
        }

        if (stats.pomodoroSessions > 0) {
            analysis += `🍅 Has hecho ${stats.pomodoroSessions} sesiones de Pomodoro\n`;
        }

        if (stats.journalEntries > 0) {
            analysis += `📖 Has escrito ${stats.journalEntries} entradas en tu diario\n`;
        }

        // Recomendaciones basadas en stats
        analysis += "\n💡 **Recomendaciones:**\n";

        if (stats.tasksCompleted < 5) {
            analysis += "• Intenta completar al menos 5 tareas diarias\n";
        }

        if (stats.habitsStreak < 3) {
            analysis += "• Mantén consistencia en tus hábitos diarios\n";
        }

        if (stats.pomodoroSessions < 10) {
            analysis += "• Usa la técnica Pomodoro para mejor concentración\n";
        }

        return analysis;
    }

    // Generar sugerencias
    async generateSuggestions() {
        const suggestions = [
            "🎯 **Establece metas SMART:** Específicas, Medibles, Alcanzables, Relevantes, con Tiempo definido",
            "⏰ **Técnica de bloques de tiempo:** Dedica bloques específicos a tareas similares",
            "📝 **Regla 2 minutos:** Si una tarea toma menos de 2 minutos, hazla inmediatamente",
            "🌅 **Empieza el día con intención:** Planifica tus 3 tareas más importantes al despertar",
            "🚫 **Elimina distracciones:** Usa modo foco y apaga notificaciones durante trabajo intenso",
            "📊 **Revisa semanalmente:** Analiza qué funcionó y qué puedes mejorar",
            "💧 **Hidratación y pausas:** Toma agua regularmente y haz pausas activas cada hora",
            "😴 **Sueño primero:** Prioriza 7-8 horas de sueño para máxima productividad"
        ];

        return "💡 **Sugerencias para mejorar tu productividad:**\n\n" +
               suggestions.slice(0, 3).join('\n\n');
    }

    // Motivación
    getMotivation() {
        const quotes = [
            "⚡ 'La productividad es nunca terminar. Es estar siempre en movimiento.' - Thomas Edison",
            "🎯 'El éxito es la suma de pequeños esfuerzos repetidos día tras día.' - Robert Collier",
            "🚀 'No esperes a que llegue la motivación. Empieza y la motivación te seguirá.'",
            "💪 'La disciplina es elegir entre lo que quieres ahora y lo que quieres más tarde.'",
            "🌟 'Cada día es una nueva oportunidad para cambiar tu vida.'",
            "🔥 'La consistencia vence a la intensidad.' - James Clear",
            "🎯 'El progreso, no la perfección.'",
            "⚡ 'Haz lo que otros no quieren hacer, para tener lo que otros no pueden tener.'"
        ];

        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    // Generar plan
    async generatePlan() {
        const now = new Date();
        const hour = now.getHours();

        let plan = "📅 **Plan sugerido para hoy:**\n\n";

        if (hour < 9) {
            plan += "🌅 **Mañana (6-9 AM):**\n";
            plan += "• Revisión de objetivos diarios\n";
            plan += "• Ejercicio matutino\n";
            plan += "• Planificación del día\n\n";
        }

        if (hour < 12) {
            plan += "☀️ **Mañana (9 AM-12 PM):**\n";
            plan += "• Trabajo profundo (bloque 1)\n";
            plan += "• Tareas importantes\n";
            plan += "• Reuniones/llamadas\n\n";
        }

        if (hour < 17) {
            plan += "🌤️ **Tarde (12-5 PM):**\n";
            plan += "• Trabajo profundo (bloque 2)\n";
            plan += "• Tareas administrativas\n";
            plan += "• Networking/colaboración\n\n";
        }

        plan += "🌆 **Tarde/Noche (5 PM+):**\n";
        plan += "• Revisión del día\n";
        plan += "• Tiempo personal/familia\n";
        plan += "• Preparación para mañana\n\n";

        plan += "💡 **Tips:**\n";
        plan += "• Usa técnica Pomodoro para concentración\n";
        plan += "• Toma pausas activas cada 90 minutos\n";
        plan += "• Revisa progreso cada 2 horas";

        return plan;
    }

    // Análisis de hábitos
    async analyzeHabits() {
        // Simular análisis de hábitos
        return "🔥 **Análisis de tus hábitos:**\n\n" +
               "Esta semana has mantenido:\n" +
               "• 5 hábitos diarios activos\n" +
               "• 85% de cumplimiento promedio\n" +
               "• Mejor hábito: 'Ejercicio' (95%)\n" +
               "• Hábito a mejorar: 'Lectura' (70%)\n\n" +
               "💡 **Sugerencia:** Establece recordatorios para hábitos difíciles";
    }

    // Análisis de tareas
    async analyzeTasks() {
        // Simular análisis de tareas
        return "✅ **Estado de tus tareas:**\n\n" +
               "• 12 tareas pendientes\n" +
               "• 8 completadas esta semana\n" +
               "• 3 tareas de alta prioridad\n" +
               "• Próxima fecha límite: Mañana\n\n" +
               "🎯 **Enfoque recomendado:** Completa las 3 tareas prioritarias primero";
    }

    // Análisis de tiempo
    async analyzeTime() {
        // Simular análisis de tiempo
        return "⏱️ **Análisis de tu tiempo:**\n\n" +
               "Esta semana has registrado:\n" +
               "• 28 horas de trabajo productivo\n" +
               "• 12 sesiones Pomodoro\n" +
               "• Promedio: 4 horas diarias\n" +
               "• Pico de productividad: 10 AM - 12 PM\n\n" +
               "📊 **Distribución:**\n" +
               "• Trabajo: 60%\n" +
               "• Reuniones: 20%\n" +
               "• Administración: 20%";
    }

    // Respuesta genérica
    async generateGenericResponse(message) {
        const responses = [
            "Interesante pregunta. Déjame analizar tu situación actual para darte una respuesta más personalizada.",
            "Para responder mejor, necesitaría más contexto sobre tus objetivos actuales. ¿Puedes darme más detalles?",
            "Esa es una buena pregunta sobre productividad. Basándome en las mejores prácticas, te recomiendo...",
            "Entiendo tu consulta. Déjame revisar tus datos actuales para darte una respuesta más precisa."
        ];

        return responses[Math.floor(Math.random() * responses.length)];
    }

    // Acciones rápidas
    quickAction(type) {
        let message = '';

        switch(type) {
            case 'analyze':
                message = 'Analiza mi productividad actual';
                break;
            case 'suggest':
                message = 'Dame sugerencias para mejorar';
                break;
            case 'motivate':
                message = 'Necesito motivación';
                break;
            case 'plan':
                message = 'Ayúdame a planificar mi día';
                break;
        }

        if (message) {
            document.getElementById('ai-input').value = message;
            this.sendMessage();
        }
    }

    // Añadir mensaje al chat
    addMessage(type, content) {
        const messagesContainer = document.getElementById('ai-messages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ai-message-${type}`;

        messageDiv.innerHTML = `
            <div class="ai-message-avatar">${type === 'bot' ? '🤖' : '👤'}</div>
            <div class="ai-message-content">${this.formatMessage(content)}</div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Añadir a conversación
        this.conversation.push({
            type,
            content,
            timestamp: Date.now()
        });
    }

    // Formatear mensaje
    formatMessage(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>')
            .replace(/•/g, '•');
    }

    // Mostrar indicador de escritura
    showTyping() {
        this.isTyping = true;
        const messagesContainer = document.getElementById('ai-messages');

        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-message ai-message-bot ai-typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="ai-message-avatar">🤖</div>
            <div class="ai-message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Ocultar indicador de escritura
    hideTyping() {
        this.isTyping = false;
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    // Obtener estadísticas de productividad
    getProductivityStats() {
        // Simular estadísticas basadas en datos reales
        return {
            tasksCompleted: Math.floor(Math.random() * 20) + 5,
            habitsStreak: Math.floor(Math.random() * 10) + 1,
            pomodoroSessions: Math.floor(Math.random() * 30) + 5,
            journalEntries: Math.floor(Math.random() * 7) + 1
        };
    }

    // Guardar conversación
    saveConversation() {
        const data = {
            conversation: this.conversation.slice(-50), // Últimas 50 mensajes
            lastUpdated: Date.now()
        };
        localStorage.setItem('ai_conversation', JSON.stringify(data));
    }

    // Cargar conversación
    loadConversation() {
        try {
            const data = JSON.parse(localStorage.getItem('ai_conversation'));
            if (data && data.conversation) {
                this.conversation = data.conversation;
                // Renderizar mensajes previos
                this.conversation.forEach(msg => {
                    this.addMessage(msg.type, msg.content);
                });
            }
        } catch (e) {
            console.warn('Error loading AI conversation:', e);
        }
    }
}

// ── SMART NOTIFICATIONS MANAGER ──────────────────────────────────
// SmartNotificationsManager.js - Sistema ultra-inteligente de notificaciones
class SmartNotificationsManager {
    constructor() {
        this.notifications = [];
        this.settings = {
            enabled: true,
            dailySummary: true,
            weeklyReport: true,
            predictiveReminders: true,
            wellnessAlerts: true,
            quietHours: { start: '22:00', end: '08:00' },
            maxNotificationsPerDay: 10
        };
        this.todayNotifications = 0;
        this.lastResetDate = today();
    }

    async init() {
        await this.loadSettings();
        this.render();
        this.scheduleNotifications();
        this.resetDailyCounter();
    }

    async loadSettings() {
        try {
            const data = await idb.get('smart-notifications-settings');
            if (data) {
                this.settings = { ...this.settings, ...data };
            }
        } catch (e) {
            console.warn('Error loading notification settings:', e);
        }
    }

    async saveSettings() {
        try {
            await idb.set('smart-notifications-settings', this.settings);
        } catch (e) {
            console.warn('Error saving notification settings:', e);
        }
    }

    render() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="smart-notifications-container">
                <div class="sn-header">
                    <div class="sn-title">🔔 Notificaciones Ultra-Inteligentes</div>
                    <div class="sn-subtitle">Sistema predictivo de recordatorios y alertas</div>
                </div>

                <div class="sn-stats">
                    <div class="sn-stat-card">
                        <div class="sn-stat-icon">📊</div>
                        <div class="sn-stat-value">${this.todayNotifications}</div>
                        <div class="sn-stat-label">Hoy</div>
                    </div>
                    <div class="sn-stat-card">
                        <div class="sn-stat-icon">🎯</div>
                        <div class="sn-stat-value">${this.getPendingNotifications()}</div>
                        <div class="sn-stat-label">Pendientes</div>
                    </div>
                    <div class="sn-stat-card">
                        <div class="sn-stat-icon">🧠</div>
                        <div class="sn-stat-value">${this.getSmartScore()}%</div>
                        <div class="sn-stat-label">Precisión IA</div>
                    </div>
                </div>

                <div class="sn-settings">
                    <div class="sn-setting-group">
                        <div class="sn-setting-title">⚙️ Configuración General</div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-enabled" ${this.settings.enabled ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Notificaciones activas</span>
                        </div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-daily-summary" ${this.settings.dailySummary ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Resumen diario</span>
                        </div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-weekly-report" ${this.settings.weeklyReport ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Reporte semanal</span>
                        </div>
                    </div>

                    <div class="sn-setting-group">
                        <div class="sn-setting-title">🎯 Notificaciones Inteligentes</div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-predictive" ${this.settings.predictiveReminders ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Recordatorios predictivos</span>
                        </div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-wellness" ${this.settings.wellnessAlerts ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Alertas de bienestar</span>
                        </div>
                    </div>

                    <div class="sn-setting-group">
                        <div class="sn-setting-title">🌙 Horas de Silencio</div>
                        <div class="sn-time-inputs">
                            <div class="sn-time-input">
                                <label>Desde:</label>
                                <input type="time" id="sn-quiet-start" value="${this.settings.quietHours.start}">
                            </div>
                            <div class="sn-time-input">
                                <label>Hasta:</label>
                                <input type="time" id="sn-quiet-end" value="${this.settings.quietHours.end}">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="sn-recent">
                    <div class="sn-recent-title">📋 Notificaciones Recientes</div>
                    <div id="sn-recent-list" class="sn-recent-list">
                        ${this.renderRecentNotifications()}
                    </div>
                </div>

                <div class="sn-actions">
                    <button class="sn-action-btn" onclick="smartNotificationsManager.testNotification()">
                        🧪 Probar Notificación
                    </button>
                    <button class="sn-action-btn" onclick="smartNotificationsManager.generateInsights()">
                        🔍 Generar Insights
                    </button>
                    <button class="sn-action-btn" onclick="smartNotificationsManager.clearHistory()">
                        🗑️ Limpiar Historial
                    </button>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    attachEventListeners() {
        // Settings toggles
        document.getElementById('sn-enabled')?.addEventListener('change', (e) => {
            this.settings.enabled = e.target.checked;
            this.saveSettings();
            this.updateNotificationSchedule();
        });

        document.getElementById('sn-daily-summary')?.addEventListener('change', (e) => {
            this.settings.dailySummary = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('sn-weekly-report')?.addEventListener('change', (e) => {
            this.settings.weeklyReport = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('sn-predictive')?.addEventListener('change', (e) => {
            this.settings.predictiveReminders = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('sn-wellness')?.addEventListener('change', (e) => {
            this.settings.wellnessAlerts = e.target.checked;
            this.saveSettings();
        });

        // Quiet hours
        document.getElementById('sn-quiet-start')?.addEventListener('change', (e) => {
            this.settings.quietHours.start = e.target.value;
            this.saveSettings();
        });

        document.getElementById('sn-quiet-end')?.addEventListener('change', (e) => {
            this.settings.quietHours.end = e.target.value;
            this.saveSettings();
        });
    }

    scheduleNotifications() {
        if (!this.settings.enabled) return;

        // Daily summary at 9 PM
        this.scheduleDailySummary();

        // Weekly report every Monday at 10 AM
        this.scheduleWeeklyReport();

        // Predictive reminders
        this.schedulePredictiveReminders();

        // Wellness alerts
        this.scheduleWellnessAlerts();
    }

    scheduleDailySummary() {
        const now = new Date();
        const summaryTime = new Date(now);
        summaryTime.setHours(21, 0, 0, 0); // 9 PM

        if (summaryTime <= now) {
            summaryTime.setDate(summaryTime.getDate() + 1);
        }

        const delay = summaryTime - now;
        setTimeout(() => {
            if (this.settings.dailySummary) {
                this.sendDailySummary();
            }
            // Schedule next one
            setInterval(() => {
                if (this.settings.dailySummary) {
                    this.sendDailySummary();
                }
            }, 24 * 60 * 60 * 1000);
        }, delay);
    }

    scheduleWeeklyReport() {
        const now = new Date();
        const reportTime = new Date(now);
        reportTime.setHours(10, 0, 0, 0); // 10 AM

        // Find next Monday
        const daysUntilMonday = (1 - now.getDay() + 7) % 7;
        if (daysUntilMonday === 0 && now.getHours() >= 10) {
            reportTime.setDate(reportTime.getDate() + 7);
        } else {
            reportTime.setDate(reportTime.getDate() + daysUntilMonday);
        }

        const delay = reportTime - now;
        setTimeout(() => {
            if (this.settings.weeklyReport) {
                this.sendWeeklyReport();
            }
            // Schedule next one
            setInterval(() => {
                if (this.settings.weeklyReport) {
                    this.sendWeeklyReport();
                }
            }, 7 * 24 * 60 * 60 * 1000);
        }, delay);
    }

    schedulePredictiveReminders() {
        // Check every hour for predictive reminders
        setInterval(() => {
            if (this.settings.predictiveReminders && this.canSendNotification()) {
                this.checkPredictiveReminders();
            }
        }, 60 * 60 * 1000); // Every hour
    }

    scheduleWellnessAlerts() {
        // Check every 4 hours for wellness alerts
        setInterval(() => {
            if (this.settings.wellnessAlerts && this.canSendNotification()) {
                this.checkWellnessAlerts();
            }
        }, 4 * 60 * 60 * 1000); // Every 4 hours
    }

    async checkPredictiveReminders() {
        const habits = S.habits || [];
        const today = today();
        const now = new Date();

        for (const habit of habits) {
            const streak = getStreak(habit);
            const lastLog = habit.logs ? Object.keys(habit.logs).sort().pop() : null;

            // If habit hasn't been done today and it's usually done at this time
            if (!habit.logs?.[today] && this.isHabitTime(habit, now)) {
                if (streak >= 3) { // Only for habits with good streaks
                    await this.sendNotification({
                        title: `¿Hora de ${habit.emoji} ${habit.name}?`,
                        body: `Tu racha de ${streak} días te está esperando. ¡No la rompas!`,
                        type: 'predictive',
                        priority: 'normal'
                    });
                }
            }
        }
    }

    async checkWellnessAlerts() {
        const today = today();
        const habits = S.habits || [];
        const completedToday = habits.filter(h => h.logs?.[today]).length;
        const totalHabits = habits.length;

        // Low completion rate alert
        if (totalHabits > 0 && completedToday / totalHabits < 0.3) {
            await this.sendNotification({
                title: '¿Estás bien?',
                body: `Solo completaste ${completedToday}/${totalHabits} hábitos hoy. Recuerda cuidar tu bienestar.`,
                type: 'wellness',
                priority: 'high'
            });
        }

        // Overworking alert (based on time tracking if available)
        const timeEntries = S.timeEntries || [];
        const todayEntries = timeEntries.filter(e => e.date === today);
        const totalTimeToday = todayEntries.reduce((sum, e) => sum + (e.duration || 0), 0);

        if (totalTimeToday > 12 * 60 * 60 * 1000) { // More than 12 hours
            await this.sendNotification({
                title: 'Descanso necesario',
                body: `Llevas ${Math.round(totalTimeToday / 3600000)} horas trabajando hoy. ¡Toma un descanso!`,
                type: 'wellness',
                priority: 'high'
            });
        }
    }

    isHabitTime(habit, now) {
        // Simple heuristic: check if current time matches typical completion times
        // This could be enhanced with ML in the future
        const logs = habit.logs || {};
        const completionTimes = Object.values(logs).map(log => {
            if (log.timestamp) {
                return new Date(log.timestamp).getHours();
            }
            return null;
        }).filter(t => t !== null);

        if (completionTimes.length < 3) return false;

        const avgHour = completionTimes.reduce((sum, h) => sum + h, 0) / completionTimes.length;
        const currentHour = now.getHours();

        return Math.abs(currentHour - avgHour) <= 2; // Within 2 hours
    }

    async sendDailySummary() {
        const today = today();
        const habits = S.habits || [];
        const completed = habits.filter(h => h.logs?.[today]).length;
        const total = habits.length;

        const summary = {
            title: '📊 Resumen Diario - FlowEX',
            body: `Completaste ${completed}/${total} hábitos hoy. ${completed === total ? '¡Día perfecto! 🎉' : 'Sigue adelante mañana.'}`,
            type: 'summary',
            priority: 'normal'
        };

        await this.sendNotification(summary);
    }

    async sendWeeklyReport() {
        const habits = S.habits || [];
        const weekStats = this.calculateWeekStats();

        const report = {
            title: '📈 Reporte Semanal - FlowEX',
            body: `Esta semana: ${weekStats.totalCompleted}/${weekStats.totalPossible} hábitos. Mejor día: ${weekStats.bestDay}. ¡Sigue así!`,
            type: 'report',
            priority: 'normal'
        };

        await this.sendNotification(report);
    }

    calculateWeekStats() {
        const habits = S.habits || [];
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());

        let totalCompleted = 0;
        let totalPossible = 0;
        const dayCounts = {};

        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];

            const dayCompleted = habits.filter(h => h.logs?.[dateStr]).length;
            dayCounts[date.toLocaleDateString('es-ES', { weekday: 'short' })] = dayCompleted;
            totalCompleted += dayCompleted;
            totalPossible += habits.length;
        }

        const bestDay = Object.entries(dayCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];

        return { totalCompleted, totalPossible, bestDay };
    }

    async sendNotification(notification) {
        if (!this.canSendNotification()) return;

        try {
            await showNotification(notification.title, {
                body: notification.body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: notification.type,
                requireInteraction: notification.priority === 'high'
            });

            this.notifications.unshift({
                ...notification,
                id: uid(),
                timestamp: Date.now(),
                read: false
            });

            this.todayNotifications++;
            await this.saveNotifications();

            // Update UI if visible
            this.updateRecentNotifications();

        } catch (e) {
            console.warn('Error sending notification:', e);
        }
    }

    canSendNotification() {
        if (!this.settings.enabled) return false;

        // Check daily limit
        if (this.todayNotifications >= this.settings.maxNotificationsPerDay) return false;

        // Check quiet hours
        const now = new Date();
        const currentTime = now.getHours() * 100 + now.getMinutes();
        const quietStart = this.parseTime(this.settings.quietHours.start);
        const quietEnd = this.parseTime(this.settings.quietHours.end);

        if (quietStart < quietEnd) {
            // Same day quiet hours
            if (currentTime >= quietStart && currentTime <= quietEnd) return false;
        } else {
            // Overnight quiet hours
            if (currentTime >= quietStart || currentTime <= quietEnd) return false;
        }

        return true;
    }

    parseTime(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 100 + minutes;
    }

    resetDailyCounter() {
        const currentDate = today();
        if (this.lastResetDate !== currentDate) {
            this.todayNotifications = 0;
            this.lastResetDate = currentDate;
        }
    }

    getPendingNotifications() {
        return this.notifications.filter(n => !n.read).length;
    }

    getSmartScore() {
        // Simple heuristic for "AI accuracy"
        const recent = this.notifications.slice(0, 10);
        if (recent.length === 0) return 85; // Default good score

        const useful = recent.filter(n => n.type !== 'test').length;
        return Math.min(95, Math.max(70, Math.round((useful / recent.length) * 100)));
    }

    renderRecentNotifications() {
        const recent = this.notifications.slice(0, 5);
        if (recent.length === 0) {
            return '<div class="sn-no-notifications">No hay notificaciones recientes</div>';
        }

        return recent.map(notification => `
            <div class="sn-notification-item ${notification.read ? 'read' : 'unread'}">
                <div class="sn-notification-icon">${this.getNotificationIcon(notification.type)}</div>
                <div class="sn-notification-content">
                    <div class="sn-notification-title">${notification.title}</div>
                    <div class="sn-notification-body">${notification.body}</div>
                    <div class="sn-notification-time">${this.formatTime(notification.timestamp)}</div>
                </div>
                <div class="sn-notification-actions">
                    ${!notification.read ? '<button onclick="smartNotificationsManager.markAsRead(\'' + notification.id + '\')">✓</button>' : ''}
                </div>
            </div>
        `).join('');
    }

    getNotificationIcon(type) {
        const icons = {
            predictive: '🎯',
            wellness: '💚',
            summary: '📊',
            report: '📈',
            test: '🧪'
        };
        return icons[type] || '🔔';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}min`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;

        return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    }

    updateRecentNotifications() {
        const list = document.getElementById('sn-recent-list');
        if (list) {
            list.innerHTML = this.renderRecentNotifications();
        }
    }

    async markAsRead(id) {
        const notification = this.notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            await this.saveNotifications();
            this.updateRecentNotifications();
        }
    }

    async saveNotifications() {
        try {
            // Keep only last 100 notifications
            this.notifications = this.notifications.slice(0, 100);
            await idb.set('smart-notifications-history', this.notifications);
        } catch (e) {
            console.warn('Error saving notifications:', e);
        }
    }

    async loadNotifications() {
        try {
            const data = await idb.get('smart-notifications-history');
            if (data) {
                this.notifications = data;
            }
        } catch (e) {
            console.warn('Error loading notifications:', e);
        }
    }

    async testNotification() {
        await this.sendNotification({
            title: '🧪 Notificación de Prueba',
            body: 'Esta es una notificación de prueba del sistema ultra-inteligente.',
            type: 'test',
            priority: 'normal'
        });
        toast('Notificación de prueba enviada!', 'success');
    }

    async generateInsights() {
        const insights = this.analyzeNotificationPatterns();
        const message = `📊 Insights de Notificaciones:\n\n${insights.map(i => `• ${i}`).join('\n')}`;

        await this.sendNotification({
            title: '🔍 Insights de Notificaciones',
            body: insights[0] || 'Análisis completado',
            type: 'insights',
            priority: 'normal'
        });

        toast('Insights generados y notificación enviada!', 'success');
    }

    analyzeNotificationPatterns() {
        const insights = [];
        const recent = this.notifications.slice(0, 20);

        if (recent.length < 5) {
            insights.push('Necesitas más datos para análisis precisos');
            return insights;
        }

        // Analyze response patterns
        const readRate = recent.filter(n => n.read).length / recent.length;
        if (readRate > 0.8) {
            insights.push('Excelente engagement con notificaciones');
        } else if (readRate < 0.5) {
            insights.push('Considera ajustar frecuencia de notificaciones');
        }

        // Analyze timing patterns
        const hourCounts = {};
        recent.forEach(n => {
            const hour = new Date(n.timestamp).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        const bestHour = Object.entries(hourCounts).reduce((a, b) => a[1] > b[1] ? a : b, [0, 0])[0];
        insights.push(`Mejor hora para notificaciones: ${bestHour}:00`);

        // Analyze type effectiveness
        const typeCounts = {};
        recent.forEach(n => {
            typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
        });

        const mostEffective = Object.entries(typeCounts).reduce((a, b) => a[1] > b[1] ? a : b, ['', 0])[0];
        insights.push(`Tipo más efectivo: ${mostEffective}`);

        return insights;
    }

    async clearHistory() {
        if (confirm('¿Eliminar todo el historial de notificaciones?')) {
            this.notifications = [];
            await this.saveNotifications();
            this.updateRecentNotifications();
            toast('Historial limpiado', 'info');
        }
    }

    updateNotificationSchedule() {
        // Clear existing schedules and restart if enabled
        if (this.settings.enabled) {
            this.scheduleNotifications();
        }
    }
}

// ── COMMUNITY MANAGER ──────────────────────────────────
// CommunityManager.js - Comunidad y sugerencias de usuarios
class CommunityManager {
    constructor() {
        this.suggestions = [];
        this.votes = {};
        this.userVotes = {};
        this.categories = ['features', 'bugs', 'ui-ux', 'performance', 'integrations', 'other'];
        this.currentFilter = 'all';
        this.currentSort = 'votes';
    }

    async init() {
        await this.loadData();
        this.render();
        this.attachEventListeners();
    }

    async loadData() {
        try {
            const suggestionsData = await idb.get('community-suggestions');
            const votesData = await idb.get('community-votes');
            const userVotesData = await idb.get('community-user-votes');

            if (suggestionsData) this.suggestions = suggestionsData;
            if (votesData) this.votes = votesData;
            if (userVotesData) this.userVotes = userVotesData;
        } catch (e) {
            console.warn('Error loading community data:', e);
        }
    }

    async saveData() {
        try {
            await idb.set('community-suggestions', this.suggestions);
            await idb.set('community-votes', this.votes);
            await idb.set('community-user-votes', this.userVotes);
        } catch (e) {
            console.warn('Error saving community data:', e);
        }
    }

    render() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="community-container">
                <div class="community-header">
                    <div class="community-title">🌍 Comunidad FlowEX</div>
                    <div class="community-subtitle">Tus ideas hacen que FlowEX sea mejor</div>
                </div>

                <div class="community-stats">
                    <div class="community-stat-card">
                        <div class="community-stat-icon">💡</div>
                        <div class="community-stat-value">${this.suggestions.length}</div>
                        <div class="community-stat-label">Ideas</div>
                    </div>
                    <div class="community-stat-card">
                        <div class="community-stat-icon">👍</div>
                        <div class="community-stat-value">${this.getTotalVotes()}</div>
                        <div class="community-stat-label">Votos</div>
                    </div>
                    <div class="community-stat-card">
                        <div class="community-stat-icon">🎯</div>
                        <div class="community-stat-value">${this.getImplementedCount()}</div>
                        <div class="community-stat-label">Implementadas</div>
                    </div>
                    <div class="community-stat-card">
                        <div class="community-stat-icon">🚀</div>
                        <div class="community-stat-value">${this.getInProgressCount()}</div>
                        <div class="community-stat-label">En Progreso</div>
                    </div>
                </div>

                <div class="community-controls">
                    <div class="community-filters">
                        <button class="community-filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" onclick="communityManager.setFilter('all')">
                            Todas
                        </button>
                        ${this.categories.map(cat => `
                            <button class="community-filter-btn ${this.currentFilter === cat ? 'active' : ''}" onclick="communityManager.setFilter('${cat}')">
                                ${this.getCategoryName(cat)}
                            </button>
                        `).join('')}
                    </div>

                    <div class="community-sort">
                        <select id="community-sort" onchange="communityManager.setSort(this.value)">
                            <option value="votes" ${this.currentSort === 'votes' ? 'selected' : ''}>Más votadas</option>
                            <option value="recent" ${this.currentSort === 'recent' ? 'selected' : ''}>Más recientes</option>
                            <option value="trending" ${this.currentSort === 'trending' ? 'selected' : ''}>Tendencia</option>
                        </select>
                    </div>
                </div>

                <div class="community-new-idea">
                    <button class="community-new-btn" onclick="communityManager.showNewIdeaForm()">
                        💡 Compartir Nueva Idea
                    </button>
                </div>

                <div id="community-suggestions-list" class="community-suggestions-list">
                    ${this.renderSuggestions()}
                </div>

                <div class="community-roadmap">
                    <div class="community-roadmap-title">🗺️ Roadmap Público</div>
                    <div class="community-roadmap-content">
                        ${this.renderRoadmap()}
                    </div>
                </div>
            </div>
        `;
    }

    getCategoryName(category) {
        const names = {
            'features': 'Features',
            'bugs': 'Bugs',
            'ui-ux': 'UI/UX',
            'performance': 'Performance',
            'integrations': 'Integraciones',
            'other': 'Otros'
        };
        return names[category] || category;
    }

    getTotalVotes() {
        return Object.values(this.votes).reduce((sum, votes) => sum + (votes || 0), 0);
    }

    getImplementedCount() {
        return this.suggestions.filter(s => s.status === 'implemented').length;
    }

    getInProgressCount() {
        return this.suggestions.filter(s => s.status === 'in-progress').length;
    }

    renderSuggestions() {
        let filtered = this.suggestions;

        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(s => s.category === this.currentFilter);
        }

        filtered = this.sortSuggestions(filtered);

        if (filtered.length === 0) {
            return `
                <div class="community-empty">
                    <div class="community-empty-icon">💭</div>
                    <div class="community-empty-title">No hay ideas aún</div>
                    <div class="community-empty-text">Sé el primero en compartir una idea para mejorar FlowEX</div>
                </div>
            `;
        }

        return filtered.map(suggestion => `
            <div class="community-suggestion-card" data-id="${suggestion.id}">
                <div class="community-suggestion-header">
                    <div class="community-suggestion-category">${this.getCategoryName(suggestion.category)}</div>
                    <div class="community-suggestion-status status-${suggestion.status}">${this.getStatusName(suggestion.status)}</div>
                </div>

                <div class="community-suggestion-content">
                    <div class="community-suggestion-title">${suggestion.title}</div>
                    <div class="community-suggestion-description">${suggestion.description}</div>
                    <div class="community-suggestion-author">Por ${suggestion.author} • ${this.formatDate(suggestion.createdAt)}</div>
                </div>

                <div class="community-suggestion-actions">
                    <button class="community-vote-btn ${this.hasUserVoted(suggestion.id) ? 'voted' : ''}"
                            onclick="communityManager.toggleVote('${suggestion.id}')">
                        👍 ${this.votes[suggestion.id] || 0}
                    </button>
                    <button class="community-comment-btn" onclick="communityManager.showComments('${suggestion.id}')">
                        💬 ${suggestion.comments?.length || 0}
                    </button>
                    <button class="community-share-btn" onclick="communityManager.shareSuggestion('${suggestion.id}')">
                        📤
                    </button>
                </div>

                ${suggestion.comments && suggestion.comments.length > 0 ? `
                    <div class="community-suggestion-comments" id="comments-${suggestion.id}" style="display: none;">
                        ${suggestion.comments.map(comment => `
                            <div class="community-comment">
                                <div class="community-comment-author">${comment.author}</div>
                                <div class="community-comment-text">${comment.text}</div>
                                <div class="community-comment-date">${this.formatDate(comment.createdAt)}</div>
                            </div>
                        `).join('')}
                        <div class="community-add-comment">
                            <input type="text" placeholder="Agregar comentario..." id="comment-input-${suggestion.id}">
                            <button onclick="communityManager.addComment('${suggestion.id}')">Enviar</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    getStatusName(status) {
        const names = {
            'pending': 'Pendiente',
            'reviewing': 'En Revisión',
            'planned': 'Planificado',
            'in-progress': 'En Progreso',
            'implemented': 'Implementado',
            'rejected': 'Rechazado'
        };
        return names[status] || status;
    }

    sortSuggestions(suggestions) {
        return suggestions.sort((a, b) => {
            switch (this.currentSort) {
                case 'votes':
                    return (this.votes[b.id] || 0) - (this.votes[a.id] || 0);
                case 'recent':
                    return new Date(b.createdAt) - new Date(a.createdAt);
                case 'trending':
                    // Simple trending algorithm: recent votes + recency
                    const aScore = (this.votes[a.id] || 0) + (Date.now() - new Date(a.createdAt)) / 86400000;
                    const bScore = (this.votes[b.id] || 0) + (Date.now() - new Date(b.createdAt)) / 86400000;
                    return bScore - aScore;
                default:
                    return 0;
            }
        });
    }

    renderRoadmap() {
        const roadmapItems = [
            { phase: 'Q2 2026', items: ['AI Mentor Avanzado', 'Sistema de Notificaciones Inteligentes'] },
            { phase: 'Q3 2026', items: ['Gamificación Completa', 'Integraciones Externas'] },
            { phase: 'Q4 2026', items: ['Modo Colaborativo', 'Analytics Predictivos'] },
            { phase: 'Q1 2027', items: ['Control por Voz', 'Realidad Aumentada'] }
        ];

        return roadmapItems.map(phase => `
            <div class="community-roadmap-phase">
                <div class="community-roadmap-phase-title">${phase.phase}</div>
                <div class="community-roadmap-phase-items">
                    ${phase.items.map(item => `<div class="community-roadmap-item">• ${item}</div>`).join('')}
                </div>
            </div>
        `).join('');
    }

    attachEventListeners() {
        // Event listeners are attached via onclick attributes in HTML
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.render();
    }

    setSort(sort) {
        this.currentSort = sort;
        this.render();
    }

    showNewIdeaForm() {
        const form = `
            <div class="community-modal-overlay" onclick="communityManager.hideModal()">
                <div class="community-modal" onclick="event.stopPropagation()">
                    <div class="community-modal-header">
                        <div class="community-modal-title">💡 Compartir Nueva Idea</div>
                        <button class="community-modal-close" onclick="communityManager.hideModal()">✕</button>
                    </div>
                    <div class="community-modal-body">
                        <div class="community-form-group">
                            <label>Título de la idea</label>
                            <input type="text" id="idea-title" placeholder="Ej: Sistema de recordatorios inteligentes">
                        </div>
                        <div class="community-form-group">
                            <label>Categoría</label>
                            <select id="idea-category">
                                ${this.categories.map(cat => `<option value="${cat}">${this.getCategoryName(cat)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="community-form-group">
                            <label>Descripción</label>
                            <textarea id="idea-description" placeholder="Describe tu idea en detalle..." rows="4"></textarea>
                        </div>
                        <div class="community-form-group">
                            <label>¿Por qué sería útil?</label>
                            <textarea id="idea-benefit" placeholder="Explica cómo beneficiaría a los usuarios..." rows="3"></textarea>
                        </div>
                    </div>
                    <div class="community-modal-footer">
                        <button class="community-btn-secondary" onclick="communityManager.hideModal()">Cancelar</button>
                        <button class="community-btn-primary" onclick="communityManager.submitIdea()">Enviar Idea</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', form);
    }

    hideModal() {
        const modal = document.querySelector('.community-modal-overlay');
        if (modal) modal.remove();
    }

    async submitIdea() {
        const title = document.getElementById('idea-title').value.trim();
        const category = document.getElementById('idea-category').value;
        const description = document.getElementById('idea-description').value.trim();
        const benefit = document.getElementById('idea-benefit').value.trim();

        if (!title || !description) {
            toast('Por favor completa título y descripción', 'error');
            return;
        }

        const idea = {
            id: uid(),
            title,
            category,
            description,
            benefit,
            author: S.name || CUR_USER || 'Usuario Anónimo',
            createdAt: new Date().toISOString(),
            status: 'pending',
            comments: []
        };

        this.suggestions.unshift(idea);
        await this.saveData();
        this.hideModal();
        this.render();

        toast('¡Idea compartida! Gracias por tu contribución.', 'success');
    }

    async toggleVote(suggestionId) {
        const userId = CUR_USER || 'anonymous';
        const userVotes = this.userVotes[userId] || {};

        if (userVotes[suggestionId]) {
            // Remove vote
            this.votes[suggestionId] = (this.votes[suggestionId] || 0) - 1;
            delete userVotes[suggestionId];
        } else {
            // Add vote
            this.votes[suggestionId] = (this.votes[suggestionId] || 0) + 1;
            userVotes[suggestionId] = true;
        }

        this.userVotes[userId] = userVotes;
        await this.saveData();
        this.render();
    }

    hasUserVoted(suggestionId) {
        const userId = CUR_USER || 'anonymous';
        return this.userVotes[userId]?.[suggestionId] || false;
    }

    showComments(suggestionId) {
        const commentsEl = document.getElementById(`comments-${suggestionId}`);
        if (commentsEl) {
            commentsEl.style.display = commentsEl.style.display === 'none' ? 'block' : 'none';
        }
    }

    async addComment(suggestionId) {
        const input = document.getElementById(`comment-input-${suggestionId}`);
        const text = input.value.trim();

        if (!text) return;

        const suggestion = this.suggestions.find(s => s.id === suggestionId);
        if (!suggestion) return;

        if (!suggestion.comments) suggestion.comments = [];

        suggestion.comments.push({
            id: uid(),
            text,
            author: S.name || CUR_USER || 'Usuario Anónimo',
            createdAt: new Date().toISOString()
        });

        input.value = '';
        await this.saveData();
        this.render();
    }

    shareSuggestion(suggestionId) {
        const suggestion = this.suggestions.find(s => s.id === suggestionId);
        if (!suggestion) return;

        const shareText = `💡 Idea para FlowEX: "${suggestion.title}"\n\n${suggestion.description}\n\n¿Te gusta? Vótala en la comunidad de FlowEX!`;
        const shareUrl = window.location.href;

        if (navigator.share) {
            navigator.share({
                title: `Idea para FlowEX: ${suggestion.title}`,
                text: shareText,
                url: shareUrl
            });
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`).then(() => {
                toast('Idea copiada al portapapeles', 'success');
            });
        }
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}min`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;

        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Admin functions (for development/testing)
    async addSampleData() {
        const sampleSuggestions = [
            {
                id: uid(),
                title: 'Sistema de gamificación completo',
                category: 'features',
                description: 'Agregar logros, niveles, recompensas y competiciones para motivar la consistencia',
                benefit: 'Aumentaría significativamente el engagement y la retención de usuarios',
                author: 'Usuario Beta',
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                status: 'implemented',
                comments: [
                    {
                        id: uid(),
                        text: '¡Excelente idea! Ya estoy emocionado',
                        author: 'Usuario 1',
                        createdAt: new Date(Date.now() - 43200000).toISOString()
                    }
                ]
            },
            {
                id: uid(),
                title: 'Integración con Google Calendar',
                category: 'integrations',
                description: 'Sincronización bidireccional con Google Calendar para eventos y recordatorios',
                benefit: 'Permitiría una mejor integración con el flujo de trabajo diario',
                author: 'Power User',
                createdAt: new Date(Date.now() - 172800000).toISOString(),
                status: 'in-progress',
                comments: []
            },
            {
                id: uid(),
                title: 'Modo oscuro mejorado',
                category: 'ui-ux',
                description: 'Implementar un modo oscuro más sofisticado con temas personalizables',
                benefit: 'Mejoraría la experiencia visual y reduciría la fatiga ocular',
                author: 'Designer',
                createdAt: new Date(Date.now() - 259200000).toISOString(),
                status: 'planned',
                comments: []
            }
        ];

        this.suggestions = [...sampleSuggestions, ...this.suggestions];

        // Add some votes
        sampleSuggestions.forEach(suggestion => {
            this.votes[suggestion.id] = Math.floor(Math.random() * 25) + 5;
        });

        await this.saveData();
        this.render();
        toast('Datos de ejemplo agregados', 'success');
    }
}

// ── UPDATES MANAGER ──────────────────────────────────
// UpdatesManager.js - Centro de actualizaciones y anuncios
class UpdatesManager {
    constructor() {
        this.updates = [];
        this.announcements = [];
        this.changelog = [];
        this.settings = {
            notifyOnUpdate: true,
            notifyOnAnnouncement: true,
            readUpdates: [],
            lastCheckedAt: null
        };
        this.updateCheckInterval = null;
    }

    async init() {
        await this.loadData();
        this.initializeDefaultUpdates();
        this.render();
        this.attachEventListeners();
        this.startUpdateCheck();
    }

    async loadData() {
        try {
            const settings = await idb.get('updates-settings');
            const updates = await idb.get('updates-data');
            const changelog = await idb.get('updates-changelog');

            if (settings) this.settings = { ...this.settings, ...settings };
            if (updates) this.updates = updates;
            if (changelog) this.changelog = changelog;
        } catch (e) {
            console.warn('Error loading updates data:', e);
        }
    }

    async saveData() {
        try {
            await idb.set('updates-settings', this.settings);
            await idb.set('updates-data', this.updates);
            await idb.set('updates-changelog', this.changelog);
        } catch (e) {
            console.warn('Error saving updates data:', e);
        }
    }

    initializeDefaultUpdates() {
        if (this.changelog.length > 0) return;

        this.changelog = [
            {
                id: uid(),
                version: '2.8.0',
                date: '2026-04-03',
                title: 'Sistema de Notificaciones Ultra-Inteligente',
                description: 'Sistema predictivo avanzado de recordatorios y alertas personalizadas',
                features: [
                    'Análisis de patrones para recordatorios predictivos',
                    'Horas de silencio personalizables',
                    'Alertas de bienestar basadas en IA',
                    'Resúmenes diarios y semanales',
                    'Historial completo de notificaciones'
                ],
                type: 'major',
                highlighted: true
            },
            {
                id: uid(),
                version: '2.7.0',
                date: '2026-04-02',
                title: 'Comunidad FlowEX',
                description: 'Sistema democrático de ideas y sugerencias de usuarios',
                features: [
                    'Compartir ideas y sugerencias',
                    'Sistema de votación comunitaria',
                    'Comentarios y discusiones',
                    'Roadmap público visible',
                    'Categorización de ideas',
                    'Estados de implementación'
                ],
                type: 'major',
                highlighted: true
            },
            {
                id: uid(),
                version: '2.6.0',
                date: '2026-03-28',
                title: 'AI Mentor Avanzado',
                description: 'Coach de productividad inteligente con análisis profundo',
                features: [
                    'Análisis inteligente de productividad',
                    'Generación automática de sugerencias',
                    'Conversaciones contextuales',
                    'Insights predictivos sobre hábitos',
                    'Panel de análisis interactivo'
                ],
                type: 'major',
                highlighted: true
            },
            {
                id: uid(),
                version: '2.5.0',
                date: '2026-03-20',
                title: 'Búsqueda Global',
                description: 'Motor de búsqueda avanzado en toda la app',
                features: [
                    'Búsqueda en tiempo real',
                    'Búsqueda por categoría',
                    'Destaque de resultados',
                    'Historial de búsquedas'
                ],
                type: 'feature'
            },
            {
                id: uid(),
                version: '2.4.0',
                date: '2026-03-15',
                title: 'Time Tracker Profesional',
                description: 'Seguimiento avanzado de tiempo con estadísticas',
                features: [
                    'Registros de tiempo en tiempo real',
                    'Categorización de actividades',
                    'Estadísticas y reportes',
                    'Exportación de datos'
                ],
                type: 'feature'
            },
            {
                id: uid(),
                version: '2.3.0',
                date: '2026-03-10',
                title: 'Diario Inteligente',
                description: 'Entradas de diario con análisis de estado de ánimo',
                features: [
                    'Entradas en formato markdown',
                    'Análisis de estado de ánimo',
                    'Conteo de racha de días',
                    'Galería de fotos'
                ],
                type: 'feature'
            },
            {
                id: uid(),
                version: '2.2.0',
                date: '2026-03-05',
                title: 'Gestor de Proyectos',
                description: 'Gestión completa de proyectos con hitos',
                features: [
                    'CRUD de proyectos',
                    'Sistema de hitos',
                    'Seguimiento de progreso',
                    'Asignación de tareas'
                ],
                type: 'feature'
            }
        ];

        this.announcements = [
            {
                id: uid(),
                title: '🎉 ¡Bienvenido a FlowEX 2.8!',
                message: 'El sistema de notificaciones inteligentes está aquí para ayudarte a ser más productivo.',
                type: 'feature',
                icon: '🚀',
                date: new Date().toISOString(),
                important: true,
                action: 'Descubre',
                actionLink: 'notificaciones'
            },
            {
                id: uid(),
                title: '👥 Tu voz importa - Comunidad FlowEX',
                message: 'Comparte tus ideas y vota por las características que quieres ver en FlowEX.',
                type: 'community',
                icon: '🌍',
                date: new Date(Date.now() - 86400000).toISOString(),
                important: true,
                action: 'Ir a Comunidad',
                actionLink: 'comunidad'
            }
        ];

        this.updates = [
            {
                id: uid(),
                title: 'Actualizaciones Recientes',
                content: 'Se han agregado 3 módulos nuevos a FlowEX:',
                timestamp: new Date().toISOString(),
                read: false,
                important: true,
                category: 'update'
            }
        ];
    }

    render() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="updates-container">
                <div class="updates-header">
                    <div class="updates-title">📢 Centro de Actualizaciones</div>
                    <div class="updates-subtitle">Entérate de todas las novedades y cambios en FlowEX</div>
                </div>

                <div class="updates-tabs">
                    <button class="updates-tab-btn active" onclick="updatesManager.switchTab('announcements')">
                        📣 Anuncios (${this.getUnreadCount('announcements')})
                    </button>
                    <button class="updates-tab-btn" onclick="updatesManager.switchTab('changelog')">
                        📋 Historial (${this.changelog.length})
                    </button>
                    <button class="updates-tab-btn" onclick="updatesManager.switchTab('notifications')">
                        🔔 Notificaciones (${this.getUnreadCount('notifications')})
                    </button>
                </div>

                <div id="updates-content" class="updates-content">
                    ${this.renderAnnouncements()}
                </div>

                <div class="updates-settings">
                    <div class="updates-settings-title">⚙️ Preferencias de Notificaciones</div>
                    <div class="updates-setting-item">
                        <label class="updates-toggle">
                            <input type="checkbox" id="notify-updates" ${this.settings.notifyOnUpdate ? 'checked' : ''}>
                            <span class="updates-toggle-slider"></span>
                        </label>
                        <span class="updates-setting-label">Notificar en actualizaciones</span>
                    </div>
                    <div class="updates-setting-item">
                        <label class="updates-toggle">
                            <input type="checkbox" id="notify-announcements" ${this.settings.notifyOnAnnouncement ? 'checked' : ''}>
                            <span class="updates-toggle-slider"></span>
                        </label>
                        <span class="updates-setting-label">Notificar anuncios importantes</span>
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    renderAnnouncements() {
        if (this.announcements.length === 0) {
            return `
                <div class="updates-empty">
                    <div class="updates-empty-icon">📭</div>
                    <div class="updates-empty-title">Sin anuncios</div>
                    <div class="updates-empty-text">No hay anuncios importantes en este momento</div>
                </div>
            `;
        }

        return `
            <div class="updates-list">
                ${this.announcements.map(announcement => `
                    <div class="updates-card ${announcement.important ? 'important' : ''}">
                        <div class="updates-card-header">
                            <div class="updates-card-icon">${announcement.icon}</div>
                            <div class="updates-card-title">${announcement.title}</div>
                            <div class="updates-card-type">${this.getTypeLabel(announcement.type)}</div>
                        </div>
                        <div class="updates-card-content">
                            ${announcement.message}
                        </div>
                        <div class="updates-card-footer">
                            <div class="updates-card-date">${this.formatTime(announcement.date)}</div>
                            ${announcement.action ? `
                                <button class="updates-card-action" onclick="gp('${announcement.actionLink}')">
                                    ${announcement.action} →
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderChangelog() {
        return `
            <div class="updates-list">
                ${this.changelog.map(release => `
                    <div class="changelog-card ${release.highlighted ? 'highlighted' : ''}">
                        <div class="changelog-header">
                            <div class="changelog-version">v${release.version}</div>
                            <div class="changelog-type">${this.getTypeLabel(release.type)}</div>
                            <div class="changelog-date">${this.formatDate(release.date)}</div>
                        </div>
                        <div class="changelog-title">${release.title}</div>
                        <div class="changelog-description">${release.description}</div>
                        <div class="changelog-features">
                            <div class="changelog-features-label">Lo nuevo:</div>
                            <ul>
                                ${release.features.map(feature => `<li>✓ ${feature}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderNotifications() {
        if (this.updates.length === 0) {
            return `
                <div class="updates-empty">
                    <div class="updates-empty-icon">✨</div>
                    <div class="updates-empty-title">Todo al día</div>
                    <div class="updates-empty-text">No hay notificaciones nuevas. ¡Estás al tanto de todo!</div>
                </div>
            `;
        }

        return `
            <div class="updates-list">
                ${this.updates.map(update => `
                    <div class="updates-notification-card ${update.read ? 'read' : 'unread'}">
                        <div class="updates-notification-dot ${update.read ? '' : 'new'}"></div>
                        <div class="updates-notification-content">
                            <div class="updates-notification-title">${update.title}</div>
                            <div class="updates-notification-text">${update.content}</div>
                            <div class="updates-notification-time">${this.formatTime(update.timestamp)}</div>
                        </div>
                        <button class="updates-mark-btn" onclick="updatesManager.markAsRead('${update.id}')">
                            ${update.read ? '✓ Leído' : 'Marcar leído'}
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    switchTab(tabName) {
        const content = document.getElementById('updates-content');
        const buttons = document.querySelectorAll('.updates-tab-btn');

        buttons.forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');

        let html = '';
        switch (tabName) {
            case 'announcements':
                html = this.renderAnnouncements();
                break;
            case 'changelog':
                html = this.renderChangelog();
                break;
            case 'notifications':
                html = this.renderNotifications();
                break;
        }

        if (content) content.innerHTML = html;
    }

    getTypeLabel(type) {
        const labels = {
            'feature': '✨ Feature',
            'bugfix': '🐛 Fix',
            'improvement': '⚡ Mejora',
            'major': '🚀 Mayor',
            'community': '👥 Comunidad',
            'security': '🔒 Seguridad'
        };
        return labels[type] || type;
    }

    getUnreadCount(type) {
        if (type === 'announcements') {
            return this.announcements.filter(a => !a.read).length;
        } else if (type === 'notifications') {
            return this.updates.filter(u => !u.read).length;
        }
        return 0;
    }

    async markAsRead(id) {
        const update = this.updates.find(u => u.id === id);
        if (update) {
            update.read = true;
            await this.saveData();
            this.render();
            await this.init();
        }
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}min`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
        if (diff < 604800000) return `Hace ${Math.floor(diff / 86400000)}d`;

        return this.formatDate(dateStr);
    }

    attachEventListeners() {
        document.getElementById('notify-updates')?.addEventListener('change', (e) => {
            this.settings.notifyOnUpdate = e.target.checked;
            this.saveData();
        });

        document.getElementById('notify-announcements')?.addEventListener('change', (e) => {
            this.settings.notifyOnAnnouncement = e.target.checked;
            this.saveData();
        });
    }

    startUpdateCheck() {
        // Check for important updates every hour
        this.updateCheckInterval = setInterval(() => {
            this.checkForNewUpdates();
        }, 60 * 60 * 1000);

        // Initial check
        this.checkForNewUpdates();
    }

    async checkForNewUpdates() {
        // In a real app, this would hit an API endpoint
        // For demo purposes, we'll check if there are unread items
        const unread = this.announcements.filter(a => !a.read).length;
        if (unread > 0 && this.settings.notifyOnAnnouncement) {
            this.showUpdateNotification();
        }
    }

    async showUpdateNotification() {
        const total = this.announcements.filter(a => !a.read).length;
        if (total > 0) {
            await showNotification('📢 Nuevos Anuncios', {
                body: `Tienes ${total} anuncio${total > 1 ? 's' : ''} nuevo${total > 1 ? 's' : ''} sobre FlowEX`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'updates'
            });
        }
    }

    // Función para agregar nuevas actualizaciones desde el admin
    async addUpdate(title, content, category = 'update', important = false) {
        const update = {
            id: uid(),
            title,
            content,
            timestamp: new Date().toISOString(),
            read: false,
            important,
            category
        };

        this.updates.unshift(update);
        await this.saveData();

        if (this.settings.notifyOnUpdate) {
            await this.showUpdateNotification();
        }

        return update.id;
    }

    // Función para agregar anuncios desde el admin
    async addAnnouncement(title, message, type = 'feature', action = null, actionLink = null) {
        const announcement = {
            id: uid(),
            title,
            message,
            type,
            icon: this.getIconForType(type),
            date: new Date().toISOString(),
            important: type === 'feature' || type === 'community',
            read: false,
            action,
            actionLink
        };

        this.announcements.unshift(announcement);
        await this.saveData();

        if (this.settings.notifyOnAnnouncement) {
            await this.showUpdateNotification();
        }

        return announcement.id;
    }

    getIconForType(type) {
        const icons = {
            'feature': '✨',
            'bugfix': '🐛',
            'improvement': '⚡',
            'major': '🚀',
            'community': '👥',
            'security': '🔒'
        };
        return icons[type] || '📢';
    }
}

// ── TODO LIST MANAGER ──────────────────────────────────
// TodoListManager.js - Gestión avanzada de listas de tareas
class TodoListManager {
    constructor() {
        this.lists = [];
        this.currentListId = null;
        this.todos = [];
        this.settings = {
            defaultList: null,
            sortBy: 'priority',
            showCompleted: false,
            autoArchiveCompleted: true,
            archiveAfterDays: 7
        };
    }

    async init() {
        await this.loadData();
        this.initializeDefaultLists();
        this.render();
        this.attachEventListeners();
    }

    async loadData() {
        try {
            const lists = await idb.get('todo-lists');
            const todos = await idb.get('todo-todos');
            const settings = await idb.get('todo-settings');

            if (lists) this.lists = lists;
            if (todos) this.todos = todos;
            if (settings) this.settings = { ...this.settings, ...settings };

            if (this.lists.length > 0) {
                this.currentListId = this.settings.defaultList || this.lists[0].id;
            }
        } catch (e) {
            console.warn('Error loading todo data:', e);
        }
    }

    async saveData() {
        try {
            await idb.set('todo-lists', this.lists);
            await idb.set('todo-todos', this.todos);
            await idb.set('todo-settings', this.settings);
        } catch (e) {
            console.warn('Error saving todo data:', e);
        }
    }

    initializeDefaultLists() {
        if (this.lists.length > 0) return;

        this.lists = [
            {
                id: uid(),
                name: '📌 Importante',
                icon: '📌',
                color: 'var(--a)',
                description: 'Tareas prioritarias del momento',
                createdAt: new Date().toISOString(),
                order: 1
            },
            {
                id: uid(),
                name: '📋 Mi Día',
                icon: '📋',
                color: 'var(--a2)',
                description: 'Tareas para hoy',
                createdAt: new Date().toISOString(),
                order: 2
            },
            {
                id: uid(),
                name: '🎯 Proyecto',
                icon: '🎯',
                color: 'var(--a3)',
                description: 'Tareas del proyecto actual',
                createdAt: new Date().toISOString(),
                order: 3
            },
            {
                id: uid(),
                name: '✅ Completadas',
                icon: '✅',
                color: 'var(--success)',
                description: 'Tareas ya completadas',
                createdAt: new Date().toISOString(),
                order: 4,
                isCompleted: true
            }
        ];

        this.currentListId = this.lists[0].id;
        this.settings.defaultList = this.lists[0].id;
    }

    render() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="todo-container">
                <div class="todo-header">
                    <div class="todo-title">📝 Mi Todo List</div>
                    <div class="todo-subtitle">Organiza y completa tus tareas de forma eficiente</div>
                </div>

                <div class="todo-main">
                    <div class="todo-sidebar">
                        ${this.renderListsSidebar()}
                    </div>

                    <div class="todo-content">
                        ${this.renderTodoContent()}
                    </div>
                </div>

                <div class="todo-stats">
                    ${this.renderStats()}
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    renderListsSidebar() {
        return `
            <div class="todo-lists">
                <div class="todo-lists-header">
                    <div class="todo-lists-title">Mis Listas</div>
                    <button class="todo-new-list-btn" onclick="todoListManager.showNewListModal()">+</button>
                </div>

                <div class="todo-lists-items">
                    ${this.lists.map(list => `
                        <button class="todo-list-item ${this.currentListId === list.id ? 'active' : ''}" onclick="todoListManager.switchList('${list.id}')">
                            <div class="todo-list-icon">${list.icon}</div>
                            <div class="todo-list-info">
                                <div class="todo-list-name">${list.name}</div>
                                <div class="todo-list-count">${this.getTodoCountForList(list.id)}</div>
                            </div>
                            <div class="todo-list-menu" onclick="event.stopPropagation(); todoListManager.showListMenu('${list.id}')">⋮</div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderTodoContent() {
        const currentList = this.lists.find(l => l.id === this.currentListId);
        if (!currentList) return '';

        const listTodos = this.getTodosForList(this.currentListId);
        const incompleteTodos = listTodos.filter(t => !t.completed);
        const completedTodos = listTodos.filter(t => t.completed);

        return `
            <div class="todo-content-inner">
                <div class="todo-list-header">
                    <div class="todo-list-title-large">
                        <span style="font-size: 24px; margin-right: 8px;">${currentList.icon}</span>
                        ${currentList.name}
                    </div>
                    <div class="todo-list-description">${currentList.description}</div>
                </div>

                <div class="todo-input-area">
                    <input type="text" id="todo-quick-input" class="todo-quick-input" placeholder="Agregar nueva tarea..." onkeypress="if(event.key==='Enter') todoListManager.quickAddTodo()">
                    <button class="todo-quick-add" onclick="todoListManager.quickAddTodo()">Agregar</button>
                </div>

                <div class="todo-filters">
                    <button class="todo-filter-btn ${!this.settings.showCompleted ? 'active' : ''}" onclick="todoListManager.toggleShowCompleted()">
                        📋 Pendientes (${incompleteTodos.length})
                    </button>
                    <button class="todo-filter-btn ${this.settings.showCompleted ? 'active' : ''}" onclick="todoListManager.toggleShowCompleted()">
                        ✅ Completadas (${completedTodos.length})
                    </button>
                </div>

                <div class="todo-items">
                    ${this.renderTodoItems(incompleteTodos, completedTodos)}
                </div>
            </div>
        `;
    }

    renderTodoItems(incompleteTodos, completedTodos) {
        if (incompleteTodos.length === 0 && !this.settings.showCompleted) {
            return `
                <div class="todo-empty">
                    <div class="todo-empty-icon">🎉</div>
                    <div class="todo-empty-title">¡Todo completado!</div>
                    <div class="todo-empty-text">No hay tareas pendientes. ¡Buen trabajo!</div>
                </div>
            `;
        }

        let html = '';

        // Pending todos
        if (incompleteTodos.length > 0) {
            html += `
                <div class="todo-section">
                    <div class="todo-section-title">Por Hacer</div>
                    <div class="todo-list-items">
                        ${incompleteTodos.sort((a, b) => {
                            if (this.settings.sortBy === 'priority') {
                                const priorityOrder = { high: 0, medium: 1, low: 2 };
                                return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
                            }
                            return new Date(b.createdAt) - new Date(a.createdAt);
                        }).map(todo => this.renderTodoItem(todo)).join('')}
                    </div>
                </div>
            `;
        }

        // Completed todos
        if (this.settings.showCompleted && completedTodos.length > 0) {
            html += `
                <div class="todo-section completed-section">
                    <div class="todo-section-title">Completadas</div>
                    <div class="todo-list-items">
                        ${completedTodos.map(todo => this.renderTodoItem(todo)).join('')}
                    </div>
                </div>
            `;
        }

        return html;
    }

    renderTodoItem(todo) {
        const priorityColors = {
            high: 'var(--error)',
            medium: 'var(--warning)',
            low: 'var(--info)'
        };

        const daysLeft = todo.dueDate ? Math.ceil((new Date(todo.dueDate) - new Date()) / 86400000) : null;
        const isOverdue = daysLeft !== null && daysLeft < 0;
        const isDueSoon = daysLeft !== null && daysLeft <= 2 && daysLeft >= 0;

        return `
            <div class="todo-item ${todo.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''} ${isDueSoon ? 'due-soon' : ''}">
                <div class="todo-item-checkbox">
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="todoListManager.toggleTodo('${todo.id}')">
                </div>

                <div class="todo-item-content">
                    <div class="todo-item-title">${todo.title}</div>
                    ${todo.description ? `<div class="todo-item-description">${todo.description}</div>` : ''}

                    <div class="todo-item-meta">
                        ${todo.priority ? `
                            <span class="todo-priority" style="background-color: ${priorityColors[todo.priority]}">
                                ${this.getPriorityLabel(todo.priority)}
                            </span>
                        ` : ''}
                        ${todo.dueDate ? `
                            <span class="todo-due-date ${isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : ''}">
                                📅 ${this.formatDueDate(todo.dueDate)}
                            </span>
                        ` : ''}
                        ${todo.tags && todo.tags.length > 0 ? `
                            <div class="todo-tags">
                                ${todo.tags.map(tag => `<span class="todo-tag">#${tag}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="todo-item-actions">
                    <button class="todo-action-btn" onclick="todoListManager.editTodo('${todo.id}')" title="Editar">✏️</button>
                    <button class="todo-action-btn delete" onclick="todoListManager.deleteTodo('${todo.id}')" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
    }

    renderStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(t => t.completed).length;
        const pending = total - completed;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const listCounts = {};
        this.lists.forEach(list => {
            listCounts[list.id] = this.getTodoCountForList(list.id);
        });

        const mostBusyList = Object.entries(listCounts).reduce((a, b) => a[1] > b[1] ? a : b, ['', 0])[0];
        const mostBusyListName = this.lists.find(l => l.id === mostBusyList)?.name || 'N/A';

        return `
            <div class="todo-stats-container">
                <div class="todo-stat-card">
                    <div class="todo-stat-icon">📊</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Total</div>
                        <div class="todo-stat-value">${total}</div>
                    </div>
                </div>

                <div class="todo-stat-card">
                    <div class="todo-stat-icon">⏳</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Pendientes</div>
                        <div class="todo-stat-value">${pending}</div>
                    </div>
                </div>

                <div class="todo-stat-card">
                    <div class="todo-stat-icon">✅</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Completadas</div>
                        <div class="todo-stat-value">${completed}</div>
                    </div>
                </div>

                <div class="todo-stat-card">
                    <div class="todo-stat-icon">📈</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Progreso</div>
                        <div class="todo-stat-value">${completionRate}%</div>
                    </div>
                </div>

                <div class="todo-stat-card">
                    <div class="todo-stat-icon">🔥</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Más Ocupada</div>
                        <div class="todo-stat-value-small">${mostBusyListName}</div>
                    </div>
                </div>
            </div>
        `;
    }

    switchList(listId) {
        this.currentListId = listId;
        this.settings.defaultList = listId;
        this.saveData();
        this.render();
    }

    getTodoCountForList(listId) {
        return this.todos.filter(t => t.listId === listId && !t.completed).length;
    }

    getTodosForList(listId) {
        return this.todos.filter(t => t.listId === listId);
    }

    async quickAddTodo() {
        const input = document.getElementById('todo-quick-input');
        if (!input) return;

        const title = input.value.trim();
        if (!title) return;

        const todo = {
            id: uid(),
            listId: this.currentListId,
            title,
            description: '',
            priority: 'medium',
            completed: false,
            dueDate: null,
            tags: [],
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        this.todos.unshift(todo);
        await this.saveData();

        input.value = '';
        input.focus();
        this.render();

        toast('✅ Tarea agregada', 'success');
    }

    async toggleTodo(todoId) {
        const todo = this.todos.find(t => t.id === todoId);
        if (todo) {
            todo.completed = !todo.completed;
            todo.completedAt = todo.completed ? new Date().toISOString() : null;
            await this.saveData();
            this.render();

            if (todo.completed) {
                confetti();
                toast('🎉 ¡Tarea completada!', 'success');
            }
        }
    }

    async deleteTodo(todoId) {
        if (!confirm('¿Eliminar esta tarea?')) return;

        this.todos = this.todos.filter(t => t.id !== todoId);
        await this.saveData();
        this.render();
        toast('🗑️ Tarea eliminada', 'info');
    }

    editTodo(todoId) {
        const todo = this.todos.find(t => t.id === todoId);
        if (!todo) return;

        this.showEditTodoModal(todo);
    }

    showNewListModal() {
        const modal = `
            <div class="todo-modal-overlay" onclick="todoListManager.hideModal()">
                <div class="todo-modal" onclick="event.stopPropagation()">
                    <div class="todo-modal-header">
                        <div class="todo-modal-title">Crear Nueva Lista</div>
                        <button class="todo-modal-close" onclick="todoListManager.hideModal()">✕</button>
                    </div>
                    <div class="todo-modal-body">
                        <div class="todo-form-group">
                            <label>Nombre de la lista</label>
                            <input type="text" id="list-name" placeholder="Ej: Mi Proyecto">
                        </div>
                        <div class="todo-form-group">
                            <label>Ícono</label>
                            <input type="text" id="list-icon" placeholder="Ej: 🎯" value="📋" maxlength="2">
                        </div>
                        <div class="todo-form-group">
                            <label>Descripción</label>
                            <textarea id="list-description" placeholder="Describe el propósito de esta lista..." rows="2"></textarea>
                        </div>
                    </div>
                    <div class="todo-modal-footer">
                        <button class="todo-btn-secondary" onclick="todoListManager.hideModal()">Cancelar</button>
                        <button class="todo-btn-primary" onclick="todoListManager.createList()">Crear</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modal);
    }

    showEditTodoModal(todo) {
        const modal = `
            <div class="todo-modal-overlay" onclick="todoListManager.hideModal()">
                <div class="todo-modal" onclick="event.stopPropagation()">
                    <div class="todo-modal-header">
                        <div class="todo-modal-title">Editar Tarea</div>
                        <button class="todo-modal-close" onclick="todoListManager.hideModal()">✕</button>
                    </div>
                    <div class="todo-modal-body">
                        <div class="todo-form-group">
                            <label>Título</label>
                            <input type="text" id="todo-title" value="${todo.title}">
                        </div>
                        <div class="todo-form-group">
                            <label>Descripción</label>
                            <textarea id="todo-description" rows="2">${todo.description || ''}</textarea>
                        </div>
                        <div class="todo-form-row">
                            <div class="todo-form-group">
                                <label>Prioridad</label>
                                <select id="todo-priority">
                                    <option value="low" ${todo.priority === 'low' ? 'selected' : ''}>Baja</option>
                                    <option value="medium" ${todo.priority === 'medium' ? 'selected' : ''}>Media</option>
                                    <option value="high" ${todo.priority === 'high' ? 'selected' : ''}>Alta</option>
                                </select>
                            </div>
                            <div class="todo-form-group">
                                <label>Fecha Límite</label>
                                <input type="date" id="todo-due-date" value="${todo.dueDate ? todo.dueDate.split('T')[0] : ''}">
                            </div>
                        </div>
                        <div class="todo-form-group">
                            <label>Etiquetas (separadas por coma)</label>
                            <input type="text" id="todo-tags" placeholder="trabajo, urgente, importante" value="${todo.tags ? todo.tags.join(', ') : ''}">
                        </div>
                    </div>
                    <div class="todo-modal-footer">
                        <button class="todo-btn-secondary" onclick="todoListManager.hideModal()">Cancelar</button>
                        <button class="todo-btn-primary" onclick="todoListManager.updateTodo('${todo.id}')">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modal);
    }

    async createList() {
        const name = document.getElementById('list-name').value.trim();
        const icon = document.getElementById('list-icon').value.trim() || '📋';
        const description = document.getElementById('list-description').value.trim();

        if (!name) {
            toast('Por favor ingresa un nombre para la lista', 'error');
            return;
        }

        const newList = {
            id: uid(),
            name: `${icon} ${name}`,
            icon,
            color: this.getRandomColor(),
            description,
            createdAt: new Date().toISOString(),
            order: this.lists.length + 1
        };

        this.lists.push(newList);
        await this.saveData();
        this.hideModal();
        this.render();

        toast('✅ Lista creada', 'success');
    }

    async updateTodo(todoId) {
        const todo = this.todos.find(t => t.id === todoId);
        if (!todo) return;

        todo.title = document.getElementById('todo-title').value.trim();
        todo.description = document.getElementById('todo-description').value.trim();
        todo.priority = document.getElementById('todo-priority').value;
        todo.dueDate = document.getElementById('todo-due-date').value || null;
        todo.tags = document.getElementById('todo-tags').value
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);

        await this.saveData();
        this.hideModal();
        this.render();

        toast('✅ Tarea actualizada', 'success');
    }

    showListMenu(listId) {
        // Could implement list menu (edit, delete, etc.)
        alert('Opciones de lista - Próximamente más funciones');
    }

    toggleShowCompleted() {
        this.settings.showCompleted = !this.settings.showCompleted;
        this.saveData();
        this.render();
    }

    hideModal() {
        const modal = document.querySelector('.todo-modal-overlay');
        if (modal) modal.remove();
    }

    getPriorityLabel(priority) {
        const labels = {
            high: '🔴 Alta',
            medium: '🟡 Media',
            low: '🟢 Baja'
        };
        return labels[priority] || priority;
    }

    formatDueDate(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Hoy';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Mañana';
        }

        return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    }

    getRandomColor() {
        const colors = [
            'var(--a)',
            'var(--a2)',
            'var(--a3)',
            'var(--warning)',
            'var(--success)',
            'var(--info)'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    attachEventListeners() {
        // Event listeners are handled via onclick in the HTML
    }

    // Quick access functions for dashboard widget
    getQuickStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(t => t.completed).length;
        const pending = total - completed;

        return {
            total,
            completed,
            pending,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }

    getQuickTodos(limit = 5) {
        return this.todos
            .filter(t => !t.completed)
            .sort((a, b) => {
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
            })
            .slice(0, limit);
    }
}

// ── PWA + BOOT ─────────────────────────────────────
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
}

// Boot: check for saved session
window.addEventListener('DOMContentLoaded', async () => {
    await new Promise(r => setTimeout(r, 600)); // min splash time
    const session = loadSession();
    
    // Validate session integrity
    const isValidSession = (sess) => {
        if (!sess || !sess.user || !sess.data) return false;
        // Check for required fields
        if (typeof sess.user !== 'string') return false;
        if (!sess.data || typeof sess.data !== 'object') return false;
        if (sess.data.level === undefined && sess.data.xp === undefined) return false;
        return true;
    };
    
    // If session is invalid/corrupted, clear everything
    if (session && !isValidSession(session)) {
        console.warn('⚠️ Corrupted session detected, clearing cache...');
        await window.clearAllCache();
        return;
    }
    
    if (session && session.user && session.data) {
        CUR_USER = session.user;
        S = {
            ...S,
            ...session.data
        };
        // Verify user still exists in Firestore
        try {
            const snap = await getDoc(userRef(CUR_USER));
            if (snap.exists()) {
                const remote = snap.data();
                S = {
                    ...S,
                    ...remote
                };
                delete S.pinHash;
                delete S.updatedAt;
                saveSession();
                hideSplash();
                startApp();
                return;
            } else {
                // User deleted from server, clear session
                console.warn('⚠️ User not found in Firestore, clearing session...');
                await window.clearAllCache();
                return;
            }
        } catch (e) {
            // Offline: use local cache
            hideSplash();
            startApp();
            setSyncStatus('error');
            return;
        }
    }
    // No session — show auth
    hideSplash();
    document.getElementById('screen-auth').classList.add('active');
    document.getElementById('screen-auth').style.display = 'flex';
});

const hideSplash = () => {
    const splash = document.getElementById('splash');
    if (splash) {
        splash.classList.add('hide');
        setTimeout(() => splash.remove(), 500);
    }
};

// ════════════════════════════════════════════ MÓDULOS NUEVOS ════════════════════════════════════════════

// ── MÓDULO: CALENDARIO 📅 ───────────────────────────────────────
let calDate = new Date();
let selectedCalDay = new Date();
let calColor = 'var(--a)';

window.calPrevMonth = () => {
    calDate.setMonth(calDate.getMonth() - 1);
    renderCalendario();
};

window.calNextMonth = () => {
    calDate.setMonth(calDate.getMonth() + 1);
    renderCalendario();
};

window.selCalDay = (dt) => {
    selectedCalDay = new Date(dt + 'T12:00:00');
    renderCalendario();
};

const renderCalDay = () => {
    const dt = selectedCalDay.toISOString().slice(0, 10);
    const evts = S.events.filter(e => e.date === dt);
    const lbl = document.getElementById('cal-sel-label');
    if (lbl) lbl.textContent = dt === today() ? 'Hoy' : dt;

    const evt = document.getElementById('cal-day-events');
    if (evt) {
        evt.innerHTML = evts.length ? evts.map(e => `
            <div class="cal-event-row">
              <div class="cal-event-bar" style="background:${e.color}"></div>
              <div class="cal-event-info">
                <div class="cal-event-name">${e.name}</div>
                <div class="cal-event-time">${e.start} - ${e.end}</div>
              </div>
              <button class="cal-event-del" onclick="deleteCalEvent('${e.id}')">✕</button>
            </div>`).join('') : '<div style="text-align:center;color:var(--m);padding:20px">Sin eventos</div>';
    }
};

window.openCalEventSheet = () => {
    const dt = selectedCalDay.toISOString().slice(0, 10);
    document.getElementById('cal-ev-name').value = '';
    document.getElementById('cal-ev-start').value = '09:00';
    document.getElementById('cal-ev-end').value = '10:00';
    const picker = document.getElementById('cal-color-picker');
    if (picker) picker.querySelector('div').classList.add('sel');
    calColor = 'var(--a)';
    window.calEvDate = dt;
    document.getElementById('sh-cal-event').classList.add('open');
};

window.selCalColor = (c, el) => {
    document.querySelectorAll('#cal-color-picker div').forEach(x => x.style.borderColor = 'transparent');
    calColor = c;
    el.style.borderColor = 'white';
};

window.saveCalEvent = () => {
    const nm = document.getElementById('cal-ev-name').value.trim();
    if (!nm) {
        toast('Escribí el nombre del evento', 'warn');
        return;
    }
    if (!S.events) S.events = [];
    S.events.push({
        id: uid(),
        date: window.calEvDate,
        name: nm,
        start: document.getElementById('cal-ev-start').value,
        end: document.getElementById('cal-ev-end').value,
        color: calColor
    });
    scheduleSave();
    csh('sh-cal-event');
    renderCalendario();
    toast('📅 Evento creado', 'success');
};

window.deleteCalEvent = (id) => {
    S.events = (S.events || []).filter(e => e.id !== id);
    scheduleSave();
    renderCalDay();
    toast('🗑 Evento eliminado', 'info');
};

// ── MÓDULO: AGUA & NUTRICIÓN 💧 ────────────────────────────────
window.toggleWater = (i) => {
    S.water.today = S.water.today === i + 1 ? i : i + 1;
    scheduleSave();
    renderNutricion();
};

window.saveWaterGoal = () => {
    S.water.goal = parseInt(document.getElementById('water-goal-inp').value) || 8;
    scheduleSave();
    renderNutricion();
};

window.resetWater = () => {
    S.water.today = 0;
    scheduleSave();
    renderNutricion();
};

window.openMealSheet = () => {
    document.getElementById('meal-desc').value = '';
    document.getElementById('meal-type').value = '🌅';
    document.getElementById('meal-cals').value = '';
    document.getElementById('meal-note').value = '';
    document.getElementById('sh-meal').classList.add('open');
};

window.saveMeal = () => {
    const desc = document.getElementById('meal-desc').value.trim();
    if (!desc) {
        toast('Escribí la descripción', 'warn');
        return;
    }
    if (!S.meals) S.meals = [];
    S.meals.push({
        id: uid(),
        date: today(),
        type: document.getElementById('meal-type').value,
        desc: desc,
        cals: parseInt(document.getElementById('meal-cals').value) || 0,
        note: document.getElementById('meal-note').value.trim()
    });
    scheduleSave();
    csh('sh-meal');
    renderNutricion();
    toast('🍽 Comida registrada', 'success');
};

window.deleteMeal = (id) => {
    S.meals = (S.meals || []).filter(m => m.id !== id);
    scheduleSave();
    renderNutricion();
};

// ── MÓDULO: POMODORO 🍅 ────────────────────────────────────────
let pomMode = 'work',
    pomTime = 25 * 60,
    pomTimer = null,
    pomRunning = false;
let pomSessions = 0,
    pomConfig = {
        work: 25,
        short: 5,
        long: 15
    };

window.renderPomodoro = () => {
    if (!S.pom) S.pom = {
        sessions: [],
        config: {
            work: 25,
            short: 5,
            long: 15
        },
        today: 0
    };
    pomConfig = S.pom.config;
    pomMode = pomMode || 'work';
    pomTime = (pomConfig[pomMode] || 25) * 60;
    pomRunning = false;

    document.querySelectorAll('.pom-mode-btn').forEach(b => b.classList.toggle('active', b.id === 'pmode-' + pomMode));
    document.getElementById('pom-display').textContent = formatTime(pomTime);
    document.getElementById('pom-mode-lbl').textContent = pomMode === 'work' ? 'FOCO' : pomMode === 'short' ? 'DESCANSO' : 'LARGO';
    document.getElementById('pom-start-btn').textContent = '▶ Iniciar';

    // Stats
    const td = today();
    const todayS = (S.pom.sessions || []).filter(s => s.date === td).length;
    const stats = document.getElementById('pom-stats-grid');
    if (stats) {
        stats.innerHTML = `
            <div class="pom-stat-card"><div class="pom-stat-val">${todayS}</div><div class="pom-stat-lbl">Hoy</div></div>
            <div class="pom-stat-card"><div class="pom-stat-val">${S.pom.sessions.length}</div><div class="pom-stat-lbl">Total</div></div>
            <div class="pom-stat-card"><div class="pom-stat-val">${pomConfig.work}m</div><div class="pom-stat-lbl">Foco</div></div>
          `;
    }

    document.getElementById('pcfg-work').value = pomConfig.work;
    document.getElementById('pcfg-short').value = pomConfig.short;
    document.getElementById('pcfg-long').value = pomConfig.long;

    const taskSel = document.getElementById('pom-task-sel');
    if (taskSel) {
        const currentTask = taskSel.value;
        const tasks = (S.tasks || []).slice(0, 10).map(t => t.name || t.title || '').filter(Boolean);
        taskSel.innerHTML = `<option value="">— Foco libre —</option>` + tasks.map(t => `<option value="${t}">${t}</option>`).join('');
        taskSel.value = currentTask || '';
        pomSelectTask();
    }

    // History
    const ph = document.getElementById('pom-history');
    if (ph) {
        const recent = (S.pom.sessions || []).slice(-5).reverse();
        ph.innerHTML = recent.length ? recent.map(s => `
            <div class="pom-hist-item">
              <div class="pom-hist-em">🍅</div>
              <div class="pom-hist-info">
                <div class="pom-hist-task">${s.task || 'Sin tarea'}</div>
                <div class="pom-hist-time">${s.date} ${s.time}</div>
              </div>
              <div class="pom-hist-dur">${s.minutes}m</div>
            </div>`).join('') : '<div style="text-align:center;color:var(--m);padding:20px">Sin sesiones</div>';
    }
};

const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

window.setPomMode = (mode) => {
    pomMode = mode;
    pomTime = (pomConfig[mode] || 25) * 60;
    pomRunning = false;
    clearInterval(pomTimer);
    renderPomodoro();
};

window.pomSelectTask = () => {
    const sel = document.getElementById('pom-task-sel');
    const lbl = document.getElementById('pom-task-lbl');
    if (!sel || !lbl) return;
    lbl.textContent = sel.value ? `En foco: ${sel.value}` : 'Sin tarea seleccionada';
};

window.pomToggle = () => {
    const btn = document.getElementById('pom-start-btn');
    pomRunning = !pomRunning;
    btn.textContent = pomRunning ? '⏸ Pausar' : '▶ Reanudar';

    if (pomRunning) {
        pomTimer = setInterval(() => {
            pomTime--;
            document.getElementById('pom-display').textContent = formatTime(pomTime);

            const modes = {
                work: 'work',
                short: 'short',
                long: 'long'
            };
            const r = document.getElementById('pom-ring');
            const total = (pomConfig[pomMode] || 25) * 60;
            const stroke = 603 * (pomTime / total);
            if (r) r.setAttribute('stroke-dashoffset', stroke.toFixed(0));

            if (pomTime <= 0) {
                clearInterval(pomTimer);
                pomRunning = false;
                btn.textContent = '▶ Iniciar';
                pomSessionComplete();
            }
        }, 1000);
    } else {
        clearInterval(pomTimer);
    }
};

const pomSessionComplete = () => {
    toast('🍅 ¡Sesión completada!', 'success');
    if (!S.pom) S.pom = {
        sessions: [],
        config: pomConfig,
        today: 0
    };
    S.pom.sessions.push({
        id: uid(),
        date: today(),
        time: new Date().toTimeString().slice(0, 5),
        task: document.getElementById('pom-task-sel')?.value || 'Sin tarea',
        minutes: pomConfig[pomMode] || 25
    });

    addXP(20);
    pomMode = pomMode === 'work' ? 'short' : 'work';
    scheduleSave();
    renderPomodoro();
};

window.pomReset = () => {
    clearInterval(pomTimer);
    pomRunning = false;
    pomMode = pomMode === 'work' ? 'work' : 'short';
    pomTime = (pomConfig[pomMode] || 25) * 60;
    renderPomodoro();
};

window.pomSkip = () => {
    clearInterval(pomTimer);
    pomMode = pomMode === 'work' ? 'short' : 'work';
    pomTime = (pomConfig[pomMode] || 25) * 60;
    pomRunning = false;
    renderPomodoro();
};

window.pomSaveConfig = () => {
    pomConfig = {
        work: parseInt(document.getElementById('pcfg-work').value) || 25,
        short: parseInt(document.getElementById('pcfg-short').value) || 5,
        long: parseInt(document.getElementById('pcfg-long').value) || 15
    };
    if (!S.pom) S.pom = {
        sessions: [],
        config: pomConfig,
        today: 0
    };
    S.pom.config = pomConfig;
    scheduleSave();
    pomReset();
    renderPomodoro();
    toast('⚙️ Configuración guardada', 'success');
};

// ── MÓDULO: FINANZAS 💰 ────────────────────────────────────────
let finDate = new Date();
let finTab = 'txs';

window.finPrevMonth = () => {
    finDate.setMonth(finDate.getMonth() - 1);
    renderFinanzas();
};

window.finNextMonth = () => {
    finDate.setMonth(finDate.getMonth() + 1);
    renderFinanzas();
};

window.setFinTab = (t, el) => {
    finTab = t;
    document.querySelectorAll('.fin-tab').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderFinanzas();
};

const renderBudgetView = () => {
    // Simple budget display - can be expanded
    const bf = document.getElementById('budget-fields');
    if (bf) bf.innerHTML = '<div style="text-align:center;color:var(--m);padding:20px">Presupuesto configurado en hoja</div>';
};

window.openFinSheet = (tipo) => {
    document.getElementById('sh-fin-title').textContent = tipo === 'expense' ? '➖ Nuevo gasto' : '➕ Nuevo ingreso';
    document.getElementById('fin-desc').value = '';
    document.getElementById('fin-amount').value = '';
    document.getElementById('fin-currency').value = 'USD';
    document.getElementById('fin-cat').value = tipo === 'income' ? 'salary' : 'food';
    document.getElementById('fin-date').value = today();
    document.getElementById('fin-note').value = '';
    window.finType = tipo;
    document.getElementById('sh-fin').classList.add('open');
};

window.saveTransaction = () => {
    const desc = document.getElementById('fin-desc').value.trim();
    const amt = parseFloat(document.getElementById('fin-amount').value) || 0;
    if (!desc || amt <= 0) {
        toast('Completá los datos', 'warn');
        return;
    }
    if (!S.finance) S.finance = {
        transactions: [],
        budget: {},
        currency: 'USD'
    };
    S.finance.transactions.push({
        id: uid(),
        type: window.finType,
        desc: desc,
        amount: amt,
        currency: document.getElementById('fin-currency').value,
        cat: document.getElementById('fin-cat').value,
        date: document.getElementById('fin-date').value,
        note: document.getElementById('fin-note').value.trim()
    });
    scheduleSave();
    csh('sh-fin');
    renderFinanzas();
    toast('💰 Movimiento registrado', 'success');
};

window.deleteTransaction = (id) => {
    if (!S.finance) S.finance = {
        transactions: [],
        budget: {},
        currency: 'USD'
    };
    S.finance.transactions = S.finance.transactions.filter(t => t.id !== id);
    scheduleSave();
    renderFinanzas();
};

window.saveBudget = () => {
    // TODO: Implementar guardado de presupuesto
};

// ── Parche: preview de horas de sueño en tiempo real ──
window.previewSleepHours = () => {
    const bed = document.getElementById('sleep-bedtime')?.value;
    const wake = document.getElementById('sleep-waketime')?.value;
    if (!bed || !wake) return;
    const [bh, bm] = bed.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    let bMin = bh * 60 + bm,
        wMin = wh * 60 + wm;
    if (wMin <= bMin) wMin += 24 * 60;
    const h = Math.max(0, (wMin - bMin) / 60);
    const val = document.getElementById('sleep-today-hrs');
    if (val) val.textContent = h.toFixed(1);
    const arc = document.getElementById('sleep-ring-arc');
    if (arc) {
        const pct = Math.min(100, h / 8 * 100);
        arc.style.strokeDashoffset = (478 * (1 - pct / 100)).toString();
    }
};

// ── Parche: renderSueno mejorado que usa las clases nuevas ──
window.renderSueno = () => {
    if (!S.sleep) S.sleep = [];
    const td = today();
    const oggi = S.sleep.find(s => s.date === td);

    // Update ring + value
    const hours = oggi?.hours || 0;
    const val = document.getElementById('sleep-today-hrs');
    if (val) val.textContent = hours > 0 ? hours.toFixed(1) : '–';
    const arc = document.getElementById('sleep-ring-arc');
    if (arc) {
        const pct = Math.min(100, hours / 8 * 100);
        arc.style.strokeDashoffset = (478 * (1 - pct / 100)).toString();
    }

    // Quality badge
    const badge = document.getElementById('sleep-quality-badge');
    if (badge && oggi?.quality) {
        const cls = oggi.quality >= 4 ? 'good' : oggi.quality >= 3 ? 'warn' : 'bad';
        const labels = ['', 'Muy mal', 'Mal', 'Regular', 'Bueno', 'Excelente'];
        badge.innerHTML = `<span class="sleep-score-pill ${cls}">${labels[oggi.quality]||'–'}</span><span class="sleep-score-pill warn">${hours.toFixed(1)}h</span>`;
    } else if (badge) badge.innerHTML = '';

    // Restore form values
    if (oggi) {
        const b = document.getElementById('sleep-bedtime');
        if (b) b.value = oggi.bedtime || '23:00';
        const w = document.getElementById('sleep-waketime');
        if (w) w.value = oggi.waketime || '07:00';
        sleepQuality = oggi.quality || 0;
        document.querySelectorAll('.sleep-q-btn').forEach(btn => btn.classList.toggle('sel', parseInt(btn.dataset.q) === sleepQuality));
    }

    // Stats
    const last7 = S.sleep.slice(-7);
    const avg7 = last7.length ? (last7.reduce((s, x) => s + x.hours, 0) / last7.length).toFixed(1) : '–';
    const minH = last7.length ? Math.min(...last7.map(x => x.hours)).toFixed(1) : '–';
    const maxH = last7.length ? Math.max(...last7.map(x => x.hours)).toFixed(1) : '–';
    const sr = document.getElementById('sleep-stats-row');
    if (sr) sr.innerHTML = `
          <div class="sleep-stat-cell"><div class="sleep-stat-val">${avg7}</div><div class="sleep-stat-lbl">Promedio</div></div>
          <div class="sleep-stat-cell"><div class="sleep-stat-val">${minH}</div><div class="sleep-stat-lbl">Mín</div></div>
          <div class="sleep-stat-cell"><div class="sleep-stat-val">${maxH}</div><div class="sleep-stat-lbl">Máx</div></div>`;

    // History
    const hist = document.getElementById('sleep-history');
    if (hist) {
        const qs = ['', '😩', '😔', '😐', '😊', '😴'];
        hist.innerHTML = last7.slice().reverse().map(s => {
            const pct = Math.min(100, s.hours / 8 * 100);
            const color = s.hours >= 7 ? 'var(--a3)' : s.hours >= 5 ? 'var(--a4)' : 'var(--a2)';
            return `<div class="sleep-history-row">
              <div class="sleep-hist-date">${s.date.slice(5)}</div>
              <div class="sleep-hist-bar-bg"><div class="sleep-hist-bar" style="width:${pct}%;background:linear-gradient(90deg,${color},var(--a5))"></div></div>
              <div class="sleep-hist-val" style="color:${color}">${s.hours.toFixed(1)}h</div>
              <div class="sleep-hist-q">${qs[s.quality]||'–'}</div>
            </div>`;
        }).join('') || '<div class="empty"><div class="ei">😴</div><div class="et">Sin registros</div><div class="ed">Guardá tu primer sueño arriba.</div></div>';
    }
};
let sleepQuality = 0;
window.selSleepQ = (q, btn) => {
    sleepQuality = q;
    document.querySelectorAll('.sleep-q-btn').forEach(b => b.classList.remove('sel'));
    if (btn) btn.classList.add('sel');
};
window.saveSleep = () => {
    const bed = document.getElementById('sleep-bedtime')?.value;
    const wake = document.getElementById('sleep-waketime')?.value;
    if (!bed || !wake) {
        toast('Completá los horarios', 'warn');
        return;
    }
    const [bh, bm] = bed.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    let bMin = bh * 60 + bm,
        wMin = wh * 60 + wm;
    if (wMin <= bMin) wMin += 24 * 60;
    const hours = Math.max(0, (wMin - bMin) / 60);
    if (!S.sleep) S.sleep = [];
    const td = today();
    const idx = S.sleep.findIndex(s => s.date === td);
    const entry = {
        date: td,
        bedtime: bed,
        waketime: wake,
        hours: Math.round(hours * 10) / 10,
        quality: sleepQuality
    };
    if (idx >= 0) S.sleep[idx] = entry;
    else S.sleep.push(entry);
    scheduleSave();
    renderSueno();
    addXP(5);
    toast(`😴 Sueño guardado: ${hours.toFixed(1)}h · Calidad ${sleepQuality}/5`, 'success');
};

let goalFilter = 'activas';
let currentGoalId = null;

// ── Parche: renderMetas con nuevo diseño ──
window.renderMetas = () => {
    if (!S.goals) S.goals = [];
    const filt = ({
        activas: S.goals.filter(g => !g.done),
        completadas: S.goals.filter(g => g.done),
        todas: S.goals
    })[goalFilter] || S.goals;

    // Update hero counters
    const tv = document.getElementById('metas-total-val');
    if (tv) tv.textContent = S.goals.length;
    const av = document.getElementById('metas-active-val');
    if (av) av.textContent = S.goals.filter(g => !g.done).length;
    const dv = document.getElementById('metas-done-val');
    if (dv) dv.textContent = S.goals.filter(g => g.done).length;

    const el = document.getElementById('goals-list');
    if (!el) return;
    if (!filt.length) {
        el.innerHTML = `<div class="empty"><div class="ei">🎯</div><div class="et">${goalFilter==='completadas'?'Sin metas completadas':'Sin metas activas'}</div><div class="ed">Tocá + para agregar tu primera meta.</div></div>`;
        return;
    }
    const catColors = {
        'salud': 'var(--a3)',
        'trabajo': 'var(--a)',
        'personal': 'var(--a4)',
        'finanzas': 'var(--a2)',
        'aprender': 'var(--a5)'
    };
    el.innerHTML = filt.map(g => {
        const pct = g.target > 0 ? Math.min(100, Math.round(g.current / g.target * 100)) : 0;
        const color = catColors[g.unit === '%' ? 'personal' : Object.keys(catColors)[0]] || 'var(--a)';
        const barColor = pct >= 100 ? 'var(--a3)' : pct >= 50 ? 'var(--a)' : 'var(--a4)';
        const ms = (g.milestones || []).slice(0, 4).map((m, i) => `
            <div class="goal-ms" onclick="toggleMilestone('${g.id}',${i})">
              <div class="goal-ms-chk ${m.done?'done':''}">${m.done?'✓':''}</div>
              <span class="goal-ms-text ${m.done?'done':''}">${m.text}</span>
            </div>`).join('');
        return `<div class="goal-card cat-${g.unit||'personal'} ${g.done?'done-goal':''}">
            <div class="goal-header">
              <div class="goal-em">${g.emoji||'🎯'}</div>
              <div class="goal-info">
                <div class="goal-title">${g.name}</div>
                <div class="goal-meta-row">
                  ${g.deadline?`<span class="goal-deadline-badge">📅 ${g.deadline}</span>`:''}
                </div>
              </div>
              <div class="goal-pct-big" style="color:${barColor}">${pct}%</div>
            </div>
            <div class="goal-progress-wrap">
              <div class="goal-progress-track"><div class="goal-progress-fill" style="width:${pct}%;background:linear-gradient(90deg,${barColor},var(--a5))"></div></div>
              <div class="goal-progress-labels"><span>0 ${g.unit||''}</span><span>${g.current} / ${g.target} ${g.unit||''}</span></div>
            </div>
            ${ms?`<div class="goal-milestones">${ms}${(g.milestones||[]).length>4?`<div style="font-size:10px;color:var(--m);padding:2px 0">+${g.milestones.length-4} hitos más</div>`:''}</div>`:''}
            <div class="goal-actions">
              <button class="goal-act-btn primary" onclick="openGoalProgSheet('${g.id}')">📈 Actualizar</button>
              <button class="goal-act-btn" onclick="openGoalSheet('${g.id}')">✎ Editar</button>
              <button class="goal-act-btn" style="color:var(--a2)" onclick="deleteGoal('${g.id}')">🗑</button>
            </div>
          </div>`;
    }).join('');
};
window.setGoalFilter = (f, btn) => {
    goalFilter = f;
    document.querySelectorAll('#goals-filter-row .fp').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    renderMetas();
};

window.openGoalSheet = (id) => {
    if (!S.goals) S.goals = [];
    currentGoalId = id || null;
    const goal = id ? S.goals.find(g => g.id === id) : null;
    document.getElementById('sh-goal-title').textContent = id ? '✏️ Editar meta' : '🎯 Nueva meta';
    document.getElementById('goal-nm').value = goal?.name || '';
    document.getElementById('goal-em').value = goal?.emoji || '🎯';
    document.getElementById('goal-deadline').value = goal?.deadline || '';
    document.getElementById('goal-cur').value = goal?.current || 0;
    document.getElementById('goal-target').value = goal?.target || 100;
    document.getElementById('goal-unit').value = goal?.unit || '%';
    document.getElementById('goal-milestones-inp').value = (goal?.milestones || []).map(m => m.text).join('\n');
    document.getElementById('del-goal-btn').style.display = id ? 'flex' : 'none';
    document.getElementById('sh-goal').classList.add('open');
};

window.saveGoal = () => {
    if (!S.goals) S.goals = [];
    const name = document.getElementById('goal-nm').value.trim();
    if (!name) {
        toast('Completá el nombre de la meta', 'warn');
        return;
    }
    const existingMilestones = goal?.milestones || [];
    const goal = {
        id: currentGoalId || uid(),
        name,
        emoji: document.getElementById('goal-em').value.trim() || '🎯',
        deadline: document.getElementById('goal-deadline').value || '',
        current: parseFloat(document.getElementById('goal-cur').value) || 0,
        target: parseFloat(document.getElementById('goal-target').value) || 100,
        unit: document.getElementById('goal-unit').value.trim() || '%',
        milestones: document.getElementById('goal-milestones-inp').value
            .split('\n')
            .map(t => t.trim())
            .filter(Boolean)
            .map(text => ({ text, done: existingMilestones.find(m => m.text === text)?.done || false })),
        done: false
    };
    goal.done = goal.current >= goal.target;
    if (currentGoalId) {
        const existing = S.goals.find(g => g.id === currentGoalId);
        if (existing) {
            Object.assign(existing, goal);
        }
    } else {
        S.goals.unshift(goal);
    }
    scheduleSave();
    csh('sh-goal');
    renderMetas();
    toast('🎯 Meta guardada', 'success');
};

window.deleteGoal = (id) => {
    const gid = id || currentGoalId;
    if (!gid) return;
    if (!confirm('¿Eliminar esta meta?')) return;
    S.goals = (S.goals || []).filter(g => g.id !== gid);
    currentGoalId = null;
    scheduleSave();
    csh('sh-goal');
    renderMetas();
    toast('🗑 Meta eliminada', 'info');
};

window.openGoalProgSheet = (id) => {
    if (!S.goals) S.goals = [];
    currentGoalId = id || currentGoalId;
    const goal = S.goals.find(g => g.id === currentGoalId);
    if (!goal) return;
    document.getElementById('sh-goal-prog-title').textContent = `📈 Actualizar “${goal.name}”`;
    document.getElementById('goal-prog-val').value = goal.current || 0;
    document.getElementById('goal-prog-hint').textContent = `Meta total: ${goal.target} ${goal.unit || ''}`;
    document.getElementById('sh-goal-prog').classList.add('open');
};

window.updateGoalProgress = () => {
    const goal = S.goals.find(g => g.id === currentGoalId);
    if (!goal) return;
    const value = parseFloat(document.getElementById('goal-prog-val').value) || 0;
    goal.current = value;
    goal.done = value >= goal.target;
    scheduleSave();
    csh('sh-goal-prog');
    renderMetas();
    toast('📈 Progreso actualizado', 'success');
};

window.toggleMilestone = (id, index) => {
    const goal = (S.goals || []).find(g => g.id === id);
    if (!goal || !Array.isArray(goal.milestones) || !goal.milestones[index]) return;
    goal.milestones[index].done = !goal.milestones[index].done;
    scheduleSave();
    renderMetas();
};

// ── Parche: renderCalendario mejorado ──
window.renderCalendario = () => {
    if (!S.events) S.events = [];
    const yr = calDate.getFullYear(),
        mo = calDate.getMonth();
    document.getElementById('cal-month-lbl').textContent = new Date(yr, mo).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long'
    }).replace(/^\w/, c => c.toUpperCase());
    const firstDay = new Date(yr, mo, 1).getDay();
    const offset = (firstDay + 6) % 7;
    const days = new Date(yr, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(`<div class="cal-day other-month"></div>`);
    for (let d = 1; d <= days; d++) {
        const dt = `${yr}-${String(mo+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const td = today();
        const isToday = dt === td;
        const isSel = dt === (selectedCalDay?.toISOString().slice(0, 10) || td);
        const isFuture = dt > td;
        const done = S.habits.filter(h => h.logs && h.logs[dt]).length;
        const total = S.habits.length;
        const hasEvt = (S.events || []).some(e => e.date === dt);
        let dotHtml = '';
        if (!isFuture && total > 0) {
            const dotColor = done === total ? 'var(--a3)' : done > 0 ? 'var(--a4)' : '';
            if (dotColor) dotHtml = `<div class="cal-event-dot" style="background:${dotColor}"></div>`;
        }
        if (hasEvt) dotHtml += `<div class="cal-event-dot" style="background:var(--a);right:3px;left:auto"></div>`;
        cells.push(`<div class="cal-day ${isToday?'today':''} ${isSel?'selected':''}" onclick="selCalDay('${dt}')">${d}${dotHtml}</div>`);
    }
    document.getElementById('cal-days').innerHTML = cells.join('');
    renderCalDay();
};

// ── Parche: renderNutricion mejorado ──
window.renderNutricion = () => {
    if (!S.water) S.water = {
        today: 0,
        goal: 8,
        logs: []
    };
    if (!S.meals) S.meals = [];
    const goal = S.water.goal || 8;
    const cur = S.water.today || 0;
    const pct = Math.min(100, Math.round(cur / goal * 100));
    const num = document.getElementById('water-num');
    if (num) num.textContent = cur;
    const den = document.getElementById('water-denom');
    if (den) den.textContent = '/' + goal;
    const fill = document.getElementById('water-track-fill');
    if (fill) fill.style.width = pct + '%';
    const lbl = document.getElementById('water-track-lbl');
    if (lbl) lbl.textContent = pct + '%';
    const gl = document.getElementById('water-track-goal');
    if (gl) gl.textContent = 'Meta: ' + goal + ' vasos';
    const gi = document.getElementById('water-goal-inp');
    if (gi) gi.value = goal;
    const glasses = document.getElementById('water-glasses');
    if (glasses) {
        glasses.innerHTML = Array.from({
            length: goal
        }, (_, i) => `
            <div class="water-glass ${i<cur?'done':''}" onclick="toggleWater(${i})">
              <div class="water-glass-fill" style="height:${i<cur?100:0}%"></div>
              <div class="water-glass-icon">${i<cur?'💧':'🥤'}</div>
            </div>`).join('');
    }
    const td = today();
    const meals = S.meals.filter(m => m.date === td);
    const totalCals = meals.reduce((s, m) => s + (m.cals || 0), 0);
    const calGoal = S.calGoal || 2000;
    const calPct = Math.min(100, Math.round(totalCals / calGoal * 100));
    const cbw = document.getElementById('cals-bar-wrap');
    if (cbw) cbw.innerHTML = `<div class="cals-bar-card">
          <div class="cals-bar-top"><div class="cals-bar-title">🍽 Calorías del día</div><div class="cals-bar-val">${totalCals} / ${calGoal} kcal</div></div>
          <div class="cals-bar-track"><div class="cals-bar-fill" style="width:${calPct}%"></div></div>
        </div>`;
    const ml = document.getElementById('meals-list');
    if (ml) {
        ml.innerHTML = meals.map(m => `
            <div class="meal-row">
              <div class="meal-em">${m.type}</div>
              <div class="meal-info"><div class="meal-name">${m.desc}</div><div class="meal-meta">${m.note||'Sin notas'}</div></div>
              <div class="meal-cals">${m.cals} kcal</div>
              <button class="meal-del" onclick="deleteMeal('${m.id}')">✕</button>
            </div>`).join('') || '';
        if (!meals.length) ml.innerHTML = '<div style="text-align:center;color:var(--m);font-size:13px;padding:16px 0">Sin comidas registradas hoy</div>';
    }
};

// ── Parche: renderMood mejorado ──
window.renderMood = () => {
    if (!S.moods) S.moods = [];
    const td = today();
    const hoy = S.moods.find(m => m.date === td);
    const MOOD_COLORS = ['', '#888', 'var(--a2)', 'var(--a4)', 'var(--a)', 'var(--a3)', 'var(--a4)'];
    const MOOD_LABELS = ['', 'Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien', 'Increíble'];
    const MOOD_EMOJIS = ['', '😞', '😕', '😐', '🙂', '😄', '🤩'];
    if (hoy) {
        document.querySelectorAll('.mood-btn').forEach(b => {
            const v = parseInt(b.dataset.mood);
            b.className = 'mood-btn' + (v === hoy.mood ? ' sel-' + v : '');
        });
        const lbl = document.getElementById('mood-label');
        if (lbl) lbl.textContent = MOOD_LABELS[hoy.mood] || '';
        const ni = document.getElementById('mood-note-inp');
        if (ni) ni.value = hoy.note || '';
    }
    const wk = getWeekKeys();
    const wc = document.getElementById('mood-week-chart');
    if (wc) {
        wc.innerHTML = wk.map((k, i) => {
            const m = S.moods.find(x => x.date === k);
            const v = m?.mood || 0;
            const pct = v ? (v / 6) * 100 : 0;
            const color = MOOD_COLORS[v] || 'var(--b)';
            const lbl = 'LMXJVSD' [i];
            return `<div class="mood-bar-col">
              <div class="mood-bar-em">${MOOD_EMOJIS[v]||'·'}</div>
              <div style="flex:1;display:flex;flex-direction:column;justify-content:flex-end;width:100%">
                <div class="mood-bar-inner" style="height:${Math.max(4,pct)}%;background:${color}"></div>
              </div>
              <div class="mood-bar-day">${lbl}</div>
            </div>`;
        }).join('');
    }
    const hist = document.getElementById('mood-history');
    if (hist) {
        const last14 = S.moods.slice(-14).reverse();
        if (!last14.length) {
            hist.innerHTML = `<div class="empty"><div class="ei">😊</div><div class="et">Sin registros</div><div class="ed">Guardá tu primer estado de ánimo arriba.</div></div>`;
            return;
        }
        hist.innerHTML = last14.map(m => {
            const color = MOOD_COLORS[m.mood] || 'var(--m)';
            return `<div class="mood-history-item">
              <div class="mood-hist-em">${MOOD_EMOJIS[m.mood]||'😐'}</div>
              <div class="mood-hist-info">
                <div class="mood-hist-date" style="color:${color}">${dateLabel(m.date)} · ${MOOD_LABELS[m.mood]}</div>
                <div class="mood-hist-note">${m.note||'(sin nota)'}</div>
              </div>
              <div class="mood-hist-val" style="background:${color}18;color:${color}">${m.mood}/6</div>
            </div>`;
        }).join('');
    }
};
window.selMood = (v, btn) => {
    document.querySelectorAll('.mood-btn').forEach(b => {
        b.className = 'mood-btn';
    });
    if (btn) btn.className = 'mood-btn sel-' + v;
    const LABELS = ['', 'Muy mal 😞', 'Mal 😕', 'Regular 😐', 'Bien 🙂', 'Muy bien 😄', 'Increíble 🤩'];
    const lbl = document.getElementById('mood-label');
    if (lbl) lbl.textContent = LABELS[v] || '';
};

window.saveMood = () => {
    const td = today();
    const mood = parseInt(document.querySelector('.mood-btn.sel')?.dataset.mood || 0);
    if (!mood) {
        toast('Seleccioná tu estado de ánimo', 'warn');
        return;
    }
    if (!S.moods) S.moods = [];
    const idx = S.moods.findIndex(m => m.date === td);
    const entry = {
        date: td,
        mood,
        note: document.getElementById('mood-note-inp').value.trim()
    };
    if (idx >= 0) S.moods[idx] = entry;
    else S.moods.push(entry);
    addXP(5);
    scheduleSave();
    renderMood();
    toast('😊 Estado guardado', 'success');
};

// ── Parche: renderFinanzas mejorado ──
window.renderFinanzas = () => {
    if (!S.finance) S.finance = {
        transactions: [],
        budget: {},
        currency: 'USD'
    };
    const yr = finDate.getFullYear();
    const mo = finDate.getMonth();
    const mname = new Date(yr, mo).toLocaleDateString('es-ES', {
        year: 'numeric',
        month: 'long'
    });
    const ml = document.getElementById('fin-month-label');
    if (ml) ml.textContent = mname.charAt(0).toUpperCase() + mname.slice(1);
    const mStart = new Date(yr, mo, 1).toISOString().slice(0, 10);
    const mEnd = new Date(yr, mo + 1, 0).toISOString().slice(0, 10);
    const txs = (S.finance.transactions || []).filter(t => t.date >= mStart && t.date <= mEnd);
    const income = txs.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const expense = txs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    const balance = income - expense;

    const hero = document.getElementById('fin-balance-hero');
    const amt = document.getElementById('fin-balance-amount');
    const det = document.getElementById('fin-balance-detail');
    if (hero) hero.className = 'fin-balance-hero ' + (balance >= 0 ? 'pos' : 'neg');
    if (amt) {
        amt.className = 'fin-balance-amount ' + (balance >= 0 ? 'pos' : 'neg');
        amt.textContent = (balance >= 0 ? '+' : '') + balance.toFixed(2);
    }
    if (det) det.innerHTML = `<span>💵 Ingresos $${income.toFixed(2)}</span><span>💸 Gastos $${expense.toFixed(2)}</span>`;

    const sum = document.getElementById('fin-summary');
    if (sum) {
        sum.innerHTML = `
            <div class="fin-sum-card"><div class="fin-sum-val fin-income">+${income.toFixed(0)}</div><div class="fin-sum-lbl">Ingresos</div></div>
            <div class="fin-sum-card"><div class="fin-sum-val fin-expense">-${expense.toFixed(0)}</div><div class="fin-sum-lbl">Gastos</div></div>
            <div class="fin-sum-card"><div class="fin-sum-val fin-balance">${balance.toFixed(0)}</div><div class="fin-sum-lbl">Balance</div></div>
          `;
    }

    const content = document.getElementById('fin-tab-content');
    if (!content) return;

    if (finTab === 'txs') {
        if (!txs.length) {
            content.innerHTML = '<div class="fin-empty">Sin movimientos este mes</div>';
            return;
        }
        const rows = txs
            .sort((a, b) => b.date.localeCompare(a.date))
            .map(t => {
                const cats = {
                    food: '🍔',
                    transport: '🚗',
                    housing: '🏠',
                    health: '💊',
                    entertainment: '🎮',
                    shopping: '🛍',
                    education: '📚',
                    subscriptions: '📱',
                    salary: '💼',
                    freelance: '💻',
                    investment: '📈',
                    gift: '🎁',
                    'other-income': '💵',
                    other: '📦'
                };
                const ico = cats[t.cat] || '📦';
                const color = t.type === 'income' ? 'var(--a3)' : 'var(--a2)';
                return `<div class="fin-tx">
                <div class="fin-tx-icon" style="background:${color}15;color:${color}">${ico}</div>
                <div class="fin-tx-info"><div class="fin-tx-desc">${t.desc}</div><div class="fin-tx-meta">${t.date.slice(5)} · ${t.cat}${t.note ? ' · ' + t.note : ''}</div></div>
                <div class="fin-tx-amt" style="color:${color}">${t.type === 'income' ? '+' : '-'}${t.amount.toFixed(2)}</div>
                <button class="fin-tx-del" onclick="deleteTransaction('${t.id}')">✕</button>
              </div>`;
            })
            .join('');
        content.innerHTML = `<div class="fin-tx-list">${rows}</div>`;

    } else if (finTab === 'cats') {
        const cats = {};
        txs.filter(t => t.type === 'expense').forEach(t => {
            cats[t.cat] = (cats[t.cat] || 0) + t.amount;
        });
        const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
        const maxV = sorted[0] ? sorted[0][1] : 1;
        const catColors = ['var(--a2)', 'var(--a4)', 'var(--a)', 'var(--a3)', 'var(--a5)'];

        const bars = sorted.map(([cat, val], i) => {
            const width = maxV ? (val / maxV) * 100 : 0;
            const color = catColors[i % catColors.length];
            return `<div class="fin-cat-row">
              <div class="fin-cat-label">${cat}</div>
              <div class="fin-cat-bar-bg"><div class="fin-cat-bar-fill" style="width:${width}%;background:${color}"></div></div>
              <div class="fin-cat-val">$${val.toFixed(0)}</div>
            </div>`;
        }).join('');

        content.innerHTML = sorted.length ?
            `<div class="fin-bar-wrap"><div class="fin-bar-title">Gastos por categoría</div>${bars}</div>` :
            '<div class="fin-empty">Sin gastos este mes</div>';

    } else {
        content.innerHTML = `<div class="fin-bar-wrap"><div class="fin-bar-title">Presupuesto mensual</div><div class="fin-empty" style="padding:10px 0">Función próximamente</div></div>`;
    }
};

// ── DIARIO MODULE ─────────────────────────────────
window.renderDiario = () => {
    journalManager.init();
    updateJournalStats();
};

// ── TIEMPO MODULE ─────────────────────────────────
window.renderTiempo = () => {
    timeTrackerManager.init();
};

// ── BUSCAR MODULE ─────────────────────────────────
window.renderBuscar = () => {
    searchManager.init();
};

// Actualizar estadísticas del diario
function updateJournalStats() {
    const stats = journalManager.getStats();
    document.getElementById('journal-streak').textContent = stats.streak;
    document.getElementById('journal-this-month').textContent = stats.thisMonth;
    document.getElementById('journal-avg-mood').textContent = journalManager.getMoodEmoji(stats.avgMood);
    document.getElementById('journal-avg-mood-text').textContent = stats.avgMood.charAt(0).toUpperCase() + stats.avgMood.slice(1);
}