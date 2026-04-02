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
const uid = () => Math.random().toString(36).slice(2, 10);
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
const saveSession = () => {
    try {
        localStorage.setItem(LC_KEY, JSON.stringify({
            user: CUR_USER,
            data: S
        }));
    } catch (e) {}
};
const loadSession = () => {
    try {
        const r = localStorage.getItem(LC_KEY);
        if (r) return JSON.parse(r);
    } catch (e) {}
    return null;
};
const clearSession = () => localStorage.removeItem(LC_KEY);

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
    }
};

// Debounced save
const scheduleSave = () => {
    isDirty = true;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
        if (isDirty) {
            pushToFirestore(S);
            isDirty = false;
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
    const val = document.getElementById('reg-user').value.trim();
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
        const hash = await hashPIN(loginPin);
        if (data.pinHash !== hash) {
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
    if (S.theme) document.body.className = S.theme;
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
    renderSettings();
    initIA();
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
    if (pid === 'sueno') renderSueno();
    if (pid === 'metas') renderMetas();
    if (pid === 'calendario') renderCalendario();
    if (pid === 'nutricion') renderNutricion();
    if (pid === 'mood') renderMood();
    if (pid === 'pomodoro') renderPomodoro();
    if (pid === 'finanzas') renderFinanzas();
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
    if (page === 'ia') initIA();
    if (page === 'admin' && isCreator()) loadAdminData();
    if (page === 'sueno') renderSueno();
    if (page === 'metas') renderMetas();
    if (page === 'calendario') renderCalendario();
    if (page === 'nutricion') renderNutricion();
    if (page === 'mood') renderMood();
    if (page === 'pomodoro') renderPomodoro();
    if (page === 'finanzas') renderFinanzas();
    document.getElementById('pc').scrollTop = 0;
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
    const need = (S.level || 1) * 100;
    if (S.xp >= need * (S.level || 1)) {
        S.level = (S.level || 1) + 1;
        toast('🎉 ¡Nivel ' + S.level + '! ' + lvlName(S.level), 'success');
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

window.onNoteInput = () => {
    if (notePreview) updateNotePreview();
    clearTimeout(noteAutoSaveTimer);
    noteAutoSaveTimer = setTimeout(saveCurrentNote, 2000);
};

window.saveCurrentNote = () => {
    notesInit();
    const title = document.getElementById('note-title-inp').value.trim();
    const body = document.getElementById('note-body-inp').value;
    const folder = 'General';
    const tagsRaw = document.getElementById('note-tags-inp').value;
    const tags = tagsRaw.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean);
    if (!title && !body) return;

    const now = new Date().toISOString();
    if (editNoteId) {
        const n = S.notes.find(x => x.id === editNoteId);
        if (n) {
            n.title = title || 'Sin título';
            n.body = body;
            n.folder = 'General';
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
              <button class="tgl ${S.notifSettings.enabled ? 'on' : ''}" onclick="toggleNotifs()"></button>
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
};

// ── LOGROS ─────────────────────────────────────────
const renderLogros = () => {
    const al = document.getElementById('achievements-list');
    if (!al) return;
    const achievements = [{
            id: 'first_habit',
            name: 'Primer hábito',
            desc: 'Creaste tu primer hábito',
            icon: '🎯',
            unlocked: S.habits.length > 0
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
            id: 'book_finished',
            name: 'Lector voraz',
            desc: 'Terminaste tu primer libro',
            icon: '📚',
            unlocked: S.books && S.books.some(b => b.status === 'terminado')
        },
        {
            id: 'note_master',
            name: 'Escritor',
            desc: 'Creaste 10 notas',
            icon: '✍️',
            unlocked: S.notes && S.notes.length >= 10
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
            ${isCreator()?`<div class="ss-item" onclick="window.gp('admin')"><div class="ss-ic" style="background:linear-gradient(135deg,rgba(250,196,109,.2),rgba(250,109,143,.15))">👑</div><div class="ss-inf"><div class="ss-lb">Panel Admin</div><div class="ss-ds">Ver estadísticas globales</div></div><div class="ss-arr">›</div></div>`:''}
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(b);
    a.download = 'flowex-' + CUR_USER + '-' + today() + '.json';
    a.click();
    toast('📤 Datos exportados', 'success');
};

// ── IA ─────────────────────────────────────────────
let iaHist = [];
const initIA = () => {
    const el = document.getElementById('ia-msgs');
    if (!el || el.children.length > 0) return;
    iaHist = [];
    appendMsg('bot', '¡Hola ' + (S.name || CUR_USER || 'amigo') + '! 👋 Soy tu coach de hábitos. Puedo analizar tu progreso, darte consejos y motivarte. ¿Qué querés saber?');
    renderQRs(['¿Cómo voy esta semana?', '¿Cuál es mi mejor racha?', 'Dame motivación', '¿Qué hábito mejorar?']);
};

const renderQRs = qs => {
    const el = document.getElementById('ia-qrs');
    if (el) el.innerHTML = qs.map(q => `<button class="iaqr" onclick="window.quickAsk('${q.replace(/'/g,"\\'")}')"> ${q}</button>`).join('');
};

window.quickAsk = q => {
    document.getElementById('ia-qrs').innerHTML = '';
    appendMsg('user', q);
    sendToAI(q);
};
window.sendIA = () => {
    const inp = document.getElementById('ia-inp');
    const msg = inp ? inp.value.trim() : '';
    if (!msg) return;
    inp.value = '';
    document.getElementById('ia-qrs').innerHTML = '';
    appendMsg('user', msg);
    sendToAI(msg);
};

const appendMsg = (role, text) => {
    const el = document.getElementById('ia-msgs');
    if (!el) return;
    const div = document.createElement('div');
    div.className = 'iam ' + role;
    div.innerHTML = `<div class="iamav">${role==='bot'?'🤖':'👤'}</div><div class="iabub">${text}</div>`;
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
};

const sendToAI = async (userMsg) => {
    const typing = document.createElement('div');
    typing.className = 'iam bot';
    typing.id = 'typing';
    typing.innerHTML = `<div class="iamav">🤖</div><div class="iabub"><div class="tdots"><span></span><span></span><span></span></div></div>`;
    document.getElementById('ia-msgs').appendChild(typing);
    document.getElementById('ia-msgs').scrollTop = 9999;

    const td = today();
    const doneCnt = S.habits.filter(h => h.logs && h.logs[td]).length;
    const habInfo = S.habits.map(h => `- ${h.emoji} ${h.name} (racha: ${getStreak(h)} días, hoy: ${h.logs&&h.logs[td]?'✅':'⬜'})`).join('\n');
    const sys = `Eres FlowEX AI, coach motivador de hábitos para @${CUR_USER} (${S.name||''}). Español conciso, máximo 3 oraciones. Nivel ${S.level}, ${S.xp} XP. Hoy: ${doneCnt}/${S.habits.length} hábitos.\nHábitos:\n${habInfo}`;
    iaHist.push({
        role: 'user',
        content: userMsg
    });

    try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'claude-sonnet-4-20250514',
                max_tokens: 400,
                system: sys,
                messages: iaHist.slice(-8)
            })
        });
        const data = await res.json();
        document.getElementById('typing')?.remove();
        const reply = data.content?.[0]?.text || 'Intentá de nuevo.';
        iaHist.push({
            role: 'assistant',
            content: reply
        });
        appendMsg('bot', reply);
    } catch (e) {
        document.getElementById('typing')?.remove();
        const tips = ['No rompas la cadena — cada ✅ construye tu identidad. 🔗', 'La consistencia vence a la intensidad. 10 min/día > 2h una vez. ⚡', 'Celebrá los pequeños logros. Cada marca es una victoria. 🏆'];
        appendMsg('bot', tips[Math.floor(Math.random() * tips.length)]);
    }
    renderQRs(['¿Cómo mejorar mi racha?', 'Dame un tip', '¿Qué hábito priorizar?', 'Motivame']);
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
        if (idx >= 0) S.books[idx] = book;
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

// ── MÓDULO: SUEÑO 😴 ───────────────────────────────────────────
window.renderSueno = () => {
    if (!S.sleep) S.sleep = [];
    const el = document.getElementById('page-sueno');
    if (!el) return;
    const td = today();
    const oggi = S.sleep.find(s => s.date === td);
    const bedtime = oggi?.bedtime || '23:00';
    const waketime = oggi?.waketime || '07:00';
    const quality = oggi?.quality || 0;
    const hours = oggi?.hours || 0;

    document.getElementById('sleep-bedtime').value = bedtime;
    document.getElementById('sleep-waketime').value = waketime;
    document.getElementById('sleep-today-hrs').textContent = hours.toFixed(1);

    // Ring progress
    const target = 8,
        pct = Math.min(100, (hours / target) * 100);
    const r = 64,
        circ = 2 * Math.PI * r,
        stroke = circ - (pct / 100) * circ;
    const arc = document.getElementById('sleep-ring-arc');
    if (arc) {
        arc.setAttribute('stroke-dasharray', circ.toFixed(2));
        arc.setAttribute('stroke-dashoffset', stroke.toFixed(2));
    }

    // Quality buttons
    document.querySelectorAll('.sleep-q-btn').forEach(btn => {
        btn.classList.toggle('sel', parseInt(btn.dataset.q) === quality);
    });

    // Stats
    const last7 = S.sleep.slice(-7);
    const avg7 = last7.length ? (last7.reduce((s, x) => s + x.hours, 0) / last7.length).toFixed(1) : '–';
    const minH = last7.length ? Math.min(...last7.map(x => x.hours)) : '–';
    const maxH = last7.length ? Math.max(...last7.map(x => x.hours)) : '–';

    const sr = document.getElementById('sleep-stats-row');
    if (sr) sr.innerHTML = `
          <div class="notes-stat"><div class="notes-stat-val">${avg7}</div><div class="notes-stat-lbl">Promedio 7d</div></div>
          <div class="notes-stat"><div class="notes-stat-val">${minH}</div><div class="notes-stat-lbl">Mín 7d</div></div>
          <div class="notes-stat"><div class="notes-stat-val">${maxH}</div><div class="notes-stat-lbl">Máx 7d</div></div>
        `;

    // History
    const hist = document.getElementById('sleep-history');
    if (hist) {
        hist.innerHTML = last7.slice().reverse().map(s => {
            const pct = Math.round((s.hours / 8) * 100);
            const q = ['', '😩', '😔', '😐', '😊', '😄'][s.quality] || '–';
            return `<div class="sleep-history-row">
              <div class="sleep-hist-date">${s.date.slice(5)}</div>
              <div class="sleep-hist-bar-bg"><div class="sleep-hist-bar" style="width:${pct}%"></div></div>
              <div class="sleep-hist-val">${s.hours.toFixed(1)}h</div>
              <div class="sleep-hist-q">${q}</div>
            </div>`;
        }).join('');
    }
};

window.selSleepQ = (q, el) => {
    document.querySelectorAll('.sleep-q-btn').forEach(b => b.classList.remove('sel'));
    el.classList.add('sel');
};

window.saveSleep = () => {
    const bed = document.getElementById('sleep-bedtime').value;
    const wake = document.getElementById('sleep-waketime').value;
    if (!bed || !wake) {
        toast('Completá los horarios', 'warn');
        return;
    }

    const [bh, bm] = bed.split(':').map(Number);
    const [wh, wm] = wake.split(':').map(Number);
    let bhMin = bh * 60 + bm;
    let whMin = wh * 60 + wm;
    if (whMin <= bhMin) whMin += 24 * 60;
    const hours = (whMin - bhMin) / 60;

    const q = parseInt(document.querySelector('.sleep-q-btn.sel')?.dataset.q || 0);
    if (!S.sleep) S.sleep = [];
    const td = today();
    const idx = S.sleep.findIndex(s => s.date === td);
    const entry = {
        date: td,
        bedtime: bed,
        waketime: wake,
        hours: Math.max(0, hours),
        quality: q
    };
    if (idx >= 0) S.sleep[idx] = entry;
    else S.sleep.push(entry);
    scheduleSave();
    renderSueno();
    toast('💾 Sueño registrado', 'success');
};

// ── MÓDULO: METAS 🎯 ───────────────────────────────────────────
let goalFilter = 'activas';
let editGoalId = null;

window.renderMetas = () => {
    if (!S.goals) S.goals = [];
    const el = document.getElementById('goals-list');
    if (!el) return;

    const filt = goalFilter === 'activas' ? S.goals.filter(g => !g.done) :
        goalFilter === 'completadas' ? S.goals.filter(g => g.done) : S.goals;

    if (!filt.length) {
        el.innerHTML = `<div class="empty"><div class="ei">🎯</div><div class="et">Sin metas</div></div>`;
        return;
    }

    el.innerHTML = filt.map(g => {
        const pct = g.target > 0 ? Math.round((g.current / g.target) * 100) : 0;
        const ms = (g.milestones || []).map((m, i) => {
            const mVal = m.value || (g.target * (i + 1) / ((g.milestones || []).length));
            const done = g.current >= mVal;
            return `<div class="goal-ms"><div class="goal-ms-chk ${done?'done':''}" onclick="toggleMilestone('${g.id}',${i})">${done?'✓':''}</div><span class="goal-ms-text ${done?'done':''}">${m.text}</span></div>`;
        });

        return `<div class="goal-card ${g.done?'done-goal':''}">
            <div class="goal-header">
              <div class="goal-em">${g.emoji || '🎯'}</div>
              <div class="goal-info">
                <div class="goal-title">${g.name}</div>
                <div class="goal-deadline">${g.deadline || 'Sin fecha'}</div>
              </div>
            </div>
            <div class="goal-progress-wrap">
              <div class="goal-progress-bar"><div class="goal-progress-fill" style="width:${pct}%"></div></div>
              <div class="goal-progress-row">
                <div class="goal-pct">${pct}%</div>
                <div class="goal-val">${g.current}/${g.target} ${g.unit}</div>
              </div>
            </div>
            ${ms.length ? `<div class="goal-milestones">${ms.join('')}</div>` : ''}
            <div class="goal-actions">
              <button class="goal-act-btn primary" onclick="openGoalProgSheet('${g.id}')">📈 Actualizar</button>
              <button class="goal-act-btn" onclick="openGoalSheet('${g.id}')">✎ Editar</button>
              <button class="goal-act-btn" onclick="deleteGoal('${g.id}')" style="color:var(--a2)">🗑</button>
            </div>
          </div>`;
    }).join('');
};

window.setGoalFilter = (f, el) => {
    goalFilter = f;
    document.querySelectorAll('#goals-filter-row .fp').forEach(b => b.classList.remove('active'));
    if (el) el.classList.add('active');
    renderMetas();
};

window.openGoalSheet = (id) => {
    editGoalId = id || null;
    const g = id ? (S.goals || []).find(x => x.id === id) : null;
    document.getElementById('sh-goal-title').textContent = g ? '✎ Editar meta' : '🎯 Nueva meta';
    document.getElementById('goal-nm').value = g?.name || '';
    document.getElementById('goal-em').value = g?.emoji || '🎯';
    document.getElementById('goal-deadline').value = g?.deadline || '';
    document.getElementById('goal-cur').value = g?.current || 0;
    document.getElementById('goal-target').value = g?.target || 100;
    document.getElementById('goal-unit').value = g?.unit || '%';
    document.getElementById('goal-milestones-inp').value = (g?.milestones || []).map(m => m.text).join('\n');
    document.getElementById('del-goal-btn').style.display = id ? 'block' : 'none';
    document.getElementById('sh-goal').classList.add('open');
};

window.saveGoal = () => {
    const nm = document.getElementById('goal-nm').value.trim();
    if (!nm) {
        toast('Escribí el nombre de la meta', 'warn');
        return;
    }
    if (!S.goals) S.goals = [];

    const ms = document.getElementById('goal-milestones-inp').value.split('\n')
        .map(t => t.trim()).filter(Boolean)
        .map((t, i) => ({
            text: t,
            value: null
        }));

    const goal = {
        name: nm,
        emoji: document.getElementById('goal-em').value,
        deadline: document.getElementById('goal-deadline').value,
        current: parseInt(document.getElementById('goal-cur').value) || 0,
        target: parseInt(document.getElementById('goal-target').value) || 100,
        unit: document.getElementById('goal-unit').value,
        milestones: ms,
        done: false
    };

    if (editGoalId) {
        const g = S.goals.find(x => x.id === editGoalId);
        if (g) Object.assign(g, goal);
        toast('✏️ Meta actualizada', 'success');
    } else {
        S.goals.unshift({
            id: uid(),
            ...goal,
            created: today()
        });
        addXP(10);
        toast('🎯 Meta creada', 'success');
    }
    scheduleSave();
    csh('sh-goal');
    renderMetas();
};

window.deleteGoal = (id) => {
    if (!confirm('¿Eliminar meta?')) return;
    S.goals = (S.goals || []).filter(g => g.id !== id);
    scheduleSave();
    renderMetas();
    toast('🗑 Meta eliminada', 'info');
};

window.toggleMilestone = (id, i) => {
    const g = (S.goals || []).find(x => x.id === id);
    if (g && g.milestones?.[i]) {
        g.milestones[i].done = !g.milestones[i].done;
        scheduleSave();
        renderMetas();
    }
};

window.openGoalProgSheet = (id) => {
    const g = (S.goals || []).find(x => x.id === id);
    if (!g) return;
    editGoalId = id;
    document.getElementById('goal-prog-val').value = g.current;
    document.getElementById('goal-prog-hint').textContent = `Actual: ${g.current} / Meta: ${g.target} ${g.unit}`;
    document.getElementById('sh-goal-prog').classList.add('open');
};

window.updateGoalProgress = () => {
    const g = (S.goals || []).find(x => x.id === editGoalId);
    if (!g) return;
    g.current = parseInt(document.getElementById('goal-prog-val').value) || 0;
    if (g.current >= g.target && !g.done) {
        g.done = true;
        addXP(50);
        confetti();
        toast('🎉 ¡Meta completada!', 'success');
    }
    scheduleSave();
    csh('sh-goal-prog');
    renderMetas();
};

// ── MÓDULO: CALENDARIO 📅 ───────────────────────────────────────
let calDate = new Date();
let selectedCalDay = new Date();
let calColor = 'var(--a)';

window.renderCalendario = () => {
    if (!S.events) S.events = [];

    const yr = calDate.getFullYear();
    const mo = calDate.getMonth();
    const firstDay = new Date(yr, mo, 1).getDay();
    const daysInMo = new Date(yr, mo + 1, 0).getDate();

    document.getElementById('cal-month-lbl').textContent =
        new Date(yr, mo).toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long'
        });

    // Headers
    const hdr = document.getElementById('cal-headers');
    if (hdr) hdr.innerHTML = 'LMXJVSD'.split('').map(d => `<div class="cal-day-hdr">${d}</div>`).join('');

    // Days
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push('');
    for (let d = 1; d <= daysInMo; d++) cells.push(d);

    const daysEl = document.getElementById('cal-days');
    if (daysEl) {
        daysEl.innerHTML = cells.map((d, i) => {
            if (!d) return '<div></div>';
            const dt = new Date(yr, mo, d).toISOString().slice(0, 10);
            const td = today();
            const hasE = S.events.some(e => e.date === dt);
            const isT = dt === td;
            const isSel = dt === selectedCalDay.toISOString().slice(0, 10);
            const cls = ['cal-day',
                isT ? 'today' : '',
                isSel ? 'selected' : '',
                hasE ? 'has-events' : ''
            ].join(' ').trim();
            return `<div onclick="selCalDay('${dt}')" class="${cls}">${d}${hasE?'<div class="cal-event-dot" style="background:var(--a3)"></div>':''}</div>`;
        }).join('');
    }

    renderCalDay();
};

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
window.renderNutricion = () => {
    if (!S.water) S.water = {
        today: 0,
        goal: 8,
        logs: []
    };
    if (!S.meals) S.meals = [];

    const goal = S.water.goal || 8;
    const today_water = S.water.today || 0;
    const pct = Math.min(100, (today_water / goal) * 100);

    document.getElementById('water-fill').style.height = pct + '%';
    document.getElementById('water-pct').textContent = Math.round(pct) + '%';
    document.getElementById('water-status').textContent = `${today_water} / ${goal} vasos`;
    document.getElementById('water-goal-inp').value = goal;

    // Glasses
    const glasses = document.getElementById('water-glasses');
    if (glasses) {
        glasses.innerHTML = Array(Math.max(goal, today_water + 1)).fill().map((_, i) =>
            `<div class="water-glass ${i < today_water ? 'filled' : ''}" onclick="toggleWater(${i})">🥤</div>`).join('');
    }

    // Meals
    const td = today();
    const todayMeals = S.meals.filter(m => m.date === td);
    const totalCals = todayMeals.reduce((s, m) => s + (m.cals || 0), 0);

    const cb = document.getElementById('cal-bar-wrap');
    if (cb) {
        const goal_cal = S.calGoal || 2000;
        const cal_pct = Math.min(100, (totalCals / goal_cal) * 100);
        cb.innerHTML = `
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <div class="fl">Calorías del día</div>
              <div style="font-family:var(--fd);font-size:14px;color:var(--a4)">${totalCals} / ${goal_cal}</div>
            </div>
            <div style="height:10px;background:var(--b);border-radius:5px;overflow:hidden">
              <div style="height:100%;background:linear-gradient(90deg,var(--a),var(--a2));width:${cal_pct}%;transition:width .5s"></div>
            </div>`;
    }

    const ml = document.getElementById('meals-list');
    if (ml) {
        ml.innerHTML = todayMeals.map(m => `
            <div class="meal-row">
              <div class="meal-em">${m.type}</div>
              <div class="meal-info">
                <div class="meal-name">${m.desc}</div>
                <div class="meal-meta">${m.note || 'Sin notas'}</div>
              </div>
              <div class="meal-cals">${m.cals} kcal</div>
              <button class="meal-del" onclick="deleteMeal('${m.id}')">✕</button>
            </div>`).join('') || '<div style="text-align:center;color:var(--m);padding:20px">Sin comidas registradas</div>';
    }
};

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

// ── MÓDULO: ESTADO DE ÁNIMO 😊 ────────────────────────────────
window.renderMood = () => {
    if (!S.moods) S.moods = [];

    const td = today();
    const hoy = S.moods.find(m => m.date === td);
    const modos = ['😞', '😕', '😐', '🙂', '😄', '🤩'];
    const labels = ['Muy mal', 'Mal', 'Regular', 'Bien', 'Muy bien', 'Increíble'];

    document.querySelectorAll('.mood-btn').forEach((btn, i) => {
        btn.classList.toggle('sel', hoy?.mood === i + 1);
    });

    const lbl = document.getElementById('mood-label');
    if (lbl) lbl.textContent = hoy?.mood ? labels[hoy.mood - 1] : '¿Cómo te sentís?';

    document.getElementById('mood-note-inp').value = hoy?.note || '';

    // Week chart
    const wk = getWeekKeys();
    const wc = document.getElementById('mood-week-chart');
    if (wc) {
        wc.innerHTML = wk.map((k, i) => {
            const m = S.moods.find(x => x.date === k);
            const mood = m?.mood || 0;
            const em = modos[mood - 1] || '–';
            const pct = (mood / 6) * 100;
            const color = ['var(--a2)', 'var(--a4)', 'var(--a3)', 'var(--a5)', 'var(--a)', 'var(--a)'][mood - 1] || 'var(--b)';
            return `<div class="mood-bar-col">
              <div class="mood-bar-em">${em}</div>
              <div class="mood-bar-inner" style="background:${color};height:${Math.max(3, pct)}%"></div>
              <div class="mood-bar-day">${'LMXJVSD'[i]}</div>
            </div>`;
        }).join('');
    }

    // History
    const hist = document.getElementById('mood-history');
    if (hist) {
        const last14 = S.moods.slice(-14).reverse();
        hist.innerHTML = last14.map(m => `
            <div class="mood-history-item">
              <div class="mood-hist-em">${modos[m.mood - 1]}</div>
              <div class="mood-hist-info">
                <div class="mood-hist-date">${m.date}</div>
                <div class="mood-hist-note">${m.note || '(sin nota)'}</div>
              </div>
            </div>`).join('') || '<div style="text-align:center;color:var(--m);padding:20px">Sin registros</div>';
    }
};

window.selMood = (m, el) => {
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('sel'));
    el.classList.add('sel');
    const labels = ['', 'Muy mal 😞', 'Mal 😕', 'Regular 😐', 'Bien 🙂', 'Muy bien 😄', 'Increíble 🤩'];
    const lbl = document.getElementById('mood-label');
    if (lbl) lbl.textContent = labels[m];
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
        mood: mood,
        note: document.getElementById('mood-note-inp').value.trim()
    };
    if (idx >= 0) S.moods[idx] = entry;
    else S.moods.push(entry);
    addXP(5);
    scheduleSave();
    renderMood();
    toast('😊 Estado guardado', 'success');
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
const _origRenderSueno = window.renderSueno;
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