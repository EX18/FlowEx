export const DEFAULT_STATE = {
  user: {
    name: 'FlowEX User',
    theme: 'dark',
    accent: 'purple',
    xp: 860,
    level: 7,
    streak: 12,
    lastLogin: new Date().toISOString(),
  },
  habits: [
    { id: 'h-1', name: 'Tomar agua', emoji: '💧', area: 'salud', goal: '2 L al día', completed: false, streak: 9 },
    { id: 'h-2', name: 'Meditar', emoji: '🧘', area: 'mente', goal: '10 min diarios', completed: true, streak: 5 },
    { id: 'h-3', name: 'Leer', emoji: '📚', area: 'crecimiento', goal: '20 páginas', completed: false, streak: 3 },
  ],
  tasks: [
    { id: 't-1', title: 'Revisar plan semanal', project: 'Productividad', due: 'today', status: 'active' },
    { id: 't-2', title: 'Actualizar diario de la mañana', project: 'Bienestar', due: 'tomorrow', status: 'pending' },
  ],
  notes: [
    { id: 'n-1', title: 'Ritual matutino', tags: ['salud', 'rutina'], pinned: true, color: 'pink', body: '### Mañana ideal\n- Agua tibia\n- 15 min de meditación\n- Revisar objetivos diarios', updated: '2026-05-14' },
    { id: 'n-2', title: 'Ideas de Growth', tags: ['work', 'ideas'], pinned: false, color: 'cyan', body: '- Revisar funnel\n- Experimentar copy premium\n- Añadir micro-feedback UI', updated: '2026-05-13' },
  ],
  pomodoro: {
    mode: 'focus',
    minutes: 25,
    seconds: 0,
    running: false,
    cycles: 2,
    history: [
      { id: 'p-1', date: '2026-05-14', focus: 4, rest: 2 },
    ],
  },
  finance: {
    balance: 1580,
    budget: 420,
    categories: [
      { id: 'f-1', name: 'Coffees', amount: 42 },
      { id: 'f-2', name: 'Inversiones', amount: 200 },
    ],
    transactions: [
      { id: 'x-1', description: 'Suscripción premium', amount: -19, category: 'suscripciones', date: '2026-05-14' },
      { id: 'x-2', description: 'Ingreso freelance', amount: 320, category: 'ingresos', date: '2026-05-13' },
    ],
  },
  settings: {
    notifications: true,
    compactView: false,
  },
};
