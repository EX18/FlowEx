import { createRouter } from './router.js';
import { createStore } from './store.js';
import { DEFAULT_STATE } from '../modules/sample-data.js';
import { loadDashboard } from '../pages/dashboard.js';
import { loadNotes } from '../pages/notes.js';
import { loadPomodoro } from '../pages/pomodoro.js';

const store = createStore(DEFAULT_STATE);

const toast = (message, type = 'default') => {
  const toastRoot = document.getElementById('toast-root');
  const toastEl = document.createElement('div');
  toastEl.className = `toast toast-${type}`;
  toastEl.textContent = message;
  toastRoot.appendChild(toastEl);
  requestAnimationFrame(() => toastEl.classList.add('visible'));
  setTimeout(() => toastEl.classList.remove('visible'), 3200);
  toastEl.addEventListener('transitionend', () => {
    if (!toastEl.classList.contains('visible')) toastEl.remove();
  });
};

const applyTheme = (theme, accent) => {
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.accent = accent;
};

const syncTheme = () => {
  const { user } = store.get();
  applyTheme(user.theme, user.accent);
};

const dispatch = async (action, payload) => {
  const state = store.get();
  switch (action) {
    case 'toggleHabit': {
      const habits = state.habits.map((item) => item.id === payload ? { ...item, completed: !item.completed } : item);
      store.set({ habits });
      toast('Hábito actualizado', 'success');
      break;
    }
    case 'togglePinNote': {
      const notes = state.notes.map((note) => note.id === payload ? { ...note, pinned: !note.pinned } : note);
      store.set({ notes });
      toast('Nota fijada', 'success');
      break;
    }
    case 'createNote': {
      const id = `n-${Date.now()}`;
      const note = {
        id,
        title: 'Nueva nota',
        tags: ['nuevo'],
        pinned: false,
        color: 'purple',
        body: 'Escribe aquí tu idea con Markdown.',
        updated: new Date().toISOString().slice(0, 10),
      };
      store.set({ notes: [note, ...state.notes] });
      toast('Nota creada', 'info');
      router.navigate('/notes');
      break;
    }
    case 'openNote': {
      const note = state.notes.find((item) => item.id === payload);
      if (note) {
        const event = new CustomEvent('flowex:renderPreview', { detail: note });
        document.getElementById('main-content').dispatchEvent(event);
      }
      break;
    }
    case 'completePomodoro': {
      const next = { ...state.pomodoro, running: false, minutes: 5, seconds: 0 };
      const history = [{ id: `p-${Date.now()}`, date: new Date().toISOString().slice(0, 10), focus: 25, rest: 5 }, ...state.pomodoro.history];
      store.set({ pomodoro: { ...next, history } });
      toast('Ciclo completado 🎉', 'success');
      break;
    }
    case 'setTheme': {
      store.set({ user: { ...state.user, theme: payload.theme, accent: payload.accent } });
      syncTheme();
      toast('Tema aplicado', 'info');
      break;
    }
    default:
      console.warn('Action no reconocida:', action);
  }
};

const routes = {
  '/': loadDashboard,
  '/notes': loadNotes,
  '/pomodoro': loadPomodoro,
};

const router = createRouter(routes);

window.flowex = { store, dispatch };

const bindNavigation = () => {
  document.querySelectorAll('[data-route]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      router.navigate(button.dataset.route);
    });
  });
};

const registerServiceWorker = () => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      console.warn('Service Worker no registrado');
    });
  }
};

const init = async () => {
  bindNavigation();
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      document.querySelectorAll('.sheet-overlay').forEach((node) => node.remove());
    }
  });
  await store.load();
  syncTheme();
  router.start();
  registerServiceWorker();
};

init();
