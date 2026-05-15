export const renderHabitRow = (habit, dispatch) => {
  const row = document.createElement('article');
  row.className = 'card habit-row';
  row.innerHTML = `
    <div class="habit-badge">${habit.emoji}</div>
    <div class="habit-copy">
      <strong>${habit.name}</strong>
      <span>${habit.goal}</span>
    </div>
    <button type="button" class="chip ${habit.completed ? 'chip-primary' : 'chip-muted'}" data-action="toggle" data-id="${habit.id}">
      ${habit.completed ? 'Hecho' : 'Marcar'}
    </button>
  `;
  row.querySelector('[data-action="toggle"]').addEventListener('click', () => {
    dispatch('toggleHabit', habit.id);
  });
  return row;
};
