export const createSheet = ({ title, content, actions = [] }) => {
  const wrapper = document.createElement('div');
  wrapper.className = 'sheet-overlay';
  wrapper.innerHTML = `
    <aside class="sheet">
      <header class="sheet-header">
        <strong>${title}</strong>
        <button type="button" class="icon-btn sheet-close" aria-label="Cerrar panel">✕</button>
      </header>
      <div class="sheet-body">${content}</div>
      <footer class="sheet-footer"></footer>
    </aside>
  `;
  wrapper.querySelector('.sheet-close').addEventListener('click', () => wrapper.remove());
  const footer = wrapper.querySelector('.sheet-footer');
  actions.forEach((action) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'button button-secondary';
    btn.textContent = action.label;
    btn.addEventListener('click', action.onClick);
    footer.appendChild(btn);
  });
  document.body.appendChild(wrapper);
  return wrapper;
};
