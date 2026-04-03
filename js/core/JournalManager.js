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