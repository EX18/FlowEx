import { renderHabitRow } from '../js/components/habit-row.js';

export const loadDashboard = async ({ root }) => {
  const { user, habits, tasks, pomodoro } = window.flowex.store.get();
  root.innerHTML = `
    <section class="page-header">
      <div>
        <p class="eyebrow">Bienvenido de nuevo</p>
        <h1>FlowEX Premium</h1>
        <p class="page-copy">Un panel central para tus hábitos, foco y estado.</p>
      </div>
      <div class="scorecard">
        <span>Nivel ${user.level}</span>
        <strong>${user.xp} XP</strong>
      </div>
    </section>
    <div class="grid grid-3">
      <article class="stat-card">
        <h2>Racha</h2>
        <p>${user.streak} días seguidos</p>
      </article>
      <article class="stat-card">
        <h2>Tareas activas</h2>
        <p>${tasks.filter((task) => task.status !== 'done').length}</p>
      </article>
      <article class="stat-card">
        <h2>Pomodoro</h2>
        <p>${pomodoro.cycles} ciclos completados</p>
      </article>
    </div>
    <section class="section-block">
      <div class="section-title-row">
        <h2>Hábitos principales</h2>
        <button type="button" class="link-button" data-route="/notes">Ver notas</button>
      </div>
      <div class="card-list"></div>
    </section>
  `;
  const list = root.querySelector('.card-list');
  habits.slice(0, 3).forEach((habit) => list.appendChild(renderHabitRow(habit, window.flowex.dispatch)));
};
