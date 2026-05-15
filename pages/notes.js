import { renderNoteCard } from '../js/components/note-card.js';
import { marked } from 'https://cdn.jsdelivr.net/npm/marked@5.1.1/es/index.js';

export const loadNotes = async ({ root }) => {
  const { notes } = window.flowex.store.get();
  root.innerHTML = `
    <section class="page-header">
      <div>
        <p class="eyebrow">Notas & Wiki</p>
        <h1>Markdown premium</h1>
        <p class="page-copy">Editor en vivo, etiquetas y contenido ordenado para tus ideas.</p>
      </div>
      <button type="button" class="button button-primary" id="new-note">Nueva nota</button>
    </section>
    <section class="section-block note-layout">
      <div class="note-grid"></div>
      <aside class="note-preview">
        <div class="note-preview-card">
          <h3>Previsualización</h3>
          <div id="note-preview">Selecciona una nota para ver el contenido aquí.</div>
        </div>
      </aside>
    </section>
  `;
  const grid = root.querySelector('.note-grid');
  notes.forEach((note) => grid.appendChild(renderNoteCard(note, window.flowex.dispatch)));

  document.getElementById('new-note').addEventListener('click', () => {
    window.flowex.dispatch('createNote');
  });

  root.addEventListener('flowex:renderPreview', (event) => {
    const preview = root.querySelector('#note-preview');
    preview.innerHTML = marked.parse(event.detail.body || 'Nada aún');
  });
};
