export const loadPomodoro = async ({ root }) => {
  const { pomodoro } = window.flowex.store.get();
  root.innerHTML = `
    <section class="page-header">
      <div>
        <p class="eyebrow">Pomodoro</p>
        <h1>Foco inteligente</h1>
        <p class="page-copy">Controla tus ciclos de trabajo y descanso con visualizaciones claras.</p>
      </div>
      <div class="pomodoro-card">
        <div class="pomodoro-clock" id="pomodoro-clock">${String(pomodoro.minutes).padStart(2, '0')}:${String(pomodoro.seconds).padStart(2, '0')}</div>
        <div class="pomodoro-actions">
          <button type="button" class="button button-primary" id="pomodoro-toggle">${pomodoro.running ? 'Pausar' : 'Iniciar'}</button>
          <button type="button" class="button button-secondary" id="pomodoro-reset">Reiniciar</button>
        </div>
      </div>
    </section>
    <section class="section-block">
      <h2>Historial reciente</h2>
      <div class="history-list">
        ${pomodoro.history.map((entry) => `
          <article class="card history-card">
            <strong>${entry.date}</strong>
            <span>${entry.focus} min / ${entry.rest} min</span>
          </article>
        `).join('')}
      </div>
    </section>
  `;

  const clock = root.querySelector('#pomodoro-clock');
  const toggle = root.querySelector('#pomodoro-toggle');
  const reset = root.querySelector('#pomodoro-reset');
  let interval = null;

  const updateClock = (minutes, seconds) => {
    clock.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const tick = () => {
    const state = window.flowex.store.get().pomodoro;
    if (state.seconds === 0) {
      if (state.minutes === 0) {
        window.flowex.dispatch('completePomodoro');
        return;
      }
      state.seconds = 59;
      state.minutes -= 1;
    } else {
      state.seconds -= 1;
    }
    window.flowex.store.set({ pomodoro: state });
    updateClock(state.minutes, state.seconds);
  };

  toggle.addEventListener('click', () => {
    const state = window.flowex.store.get().pomodoro;
    const nextRunning = !state.running;
    window.flowex.store.set({ pomodoro: { ...state, running: nextRunning } });
    toggle.textContent = nextRunning ? 'Pausar' : 'Iniciar';
    if (nextRunning) {
      interval = setInterval(tick, 1000);
    } else {
      clearInterval(interval);
    }
  });

  reset.addEventListener('click', () => {
    clearInterval(interval);
    window.flowex.store.set({ pomodoro: { ...pomodoro, minutes: 25, seconds: 0, running: false } });
    updateClock(25, 0);
    toggle.textContent = 'Iniciar';
  });
};
