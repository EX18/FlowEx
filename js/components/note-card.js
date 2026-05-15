export const renderNoteCard = (note, dispatch) => {
  const card = document.createElement('article');
  card.className = `card note-card note-${note.color}`;
  card.innerHTML = `
    <div class="note-header">
      <div>
        <strong>${note.title}</strong>
        <p>${note.tags.map((tag) => `#${tag}`).join(' ')}</p>
      </div>
      <button type="button" class="icon-btn" aria-label="Pin note" data-action="pin" data-id="${note.id}">📌</button>
    </div>
    <div class="note-body">${note.body.split('\n').slice(0, 4).join('<br>')}</div>
    <div class="note-meta">Actualizado ${note.updated}</div>
  `;
  const pinButton = card.querySelector('[data-action="pin"]');
  pinButton.addEventListener('click', (event) => {
    event.stopPropagation();
    dispatch('togglePinNote', note.id);
  });
  card.addEventListener('click', () => dispatch('openNote', note.id));
  return card;
};
