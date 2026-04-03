// SearchManager.js - Búsqueda global en toda la app
class SearchManager {
    constructor() {
        this.results = [];
        this.currentQuery = '';
    }

    // Inicializar
    init() {
        this.renderSearch();
    }

    // Realizar búsqueda
    async search(query) {
        if (!query.trim()) {
            this.results = [];
            this.renderResults();
            return;
        }

        this.currentQuery = query.toLowerCase();
        this.results = [];

        // Buscar en tareas
        const tasks = S.tasks || [];
        tasks.forEach(task => {
            if (this.matches(task.title) || this.matches(task.desc)) {
                this.results.push({
                    type: 'task',
                    id: task.id,
                    title: task.title,
                    content: task.desc,
                    category: 'Tareas',
                    icon: '✅',
                    action: () => gp('tareas')
                });
            }
        });

        // Buscar en hábitos
        const habits = S.habits || [];
        habits.forEach(habit => {
            if (this.matches(habit.name)) {
                this.results.push({
                    type: 'habit',
                    id: habit.id,
                    title: habit.name,
                    content: habit.area,
                    category: 'Hábitos',
                    icon: '🔥',
                    action: () => gp('habitos')
                });
            }
        });

        // Buscar en notas
        const notes = S.notes || [];
        notes.forEach(note => {
            if (this.matches(note.title) || this.matches(note.content)) {
                this.results.push({
                    type: 'note',
                    id: note.id,
                    title: note.title,
                    content: this.getPreview(note.content),
                    category: 'Notas',
                    icon: '📝',
                    action: () => gp('notas')
                });
            }
        });

        // Buscar en proyectos (si existe)
        try {
            const projects = await idbGet('projects') || [];
            projects.forEach(project => {
                if (this.matches(project.name) || this.matches(project.description)) {
                    this.results.push({
                        type: 'project',
                        id: project.id,
                        title: project.name,
                        content: project.description,
                        category: 'Proyectos',
                        icon: '📁',
                        action: () => {
                            gp('proyectos');
                            setTimeout(() => projectManager.selectProject(project.id), 100);
                        }
                    });
                }
            });
        } catch (e) {}

        // Buscar en diario (si existe)
        try {
            const journal = await idbGet('journal') || [];
            journal.forEach(entry => {
                if (this.matches(entry.title) || this.matches(entry.content) || entry.tags.some(tag => this.matches(tag))) {
                    this.results.push({
                        type: 'journal',
                        id: entry.id,
                        title: entry.title || 'Sin título',
                        content: this.getPreview(entry.content),
                        category: 'Diario',
                        icon: '📖',
                        action: () => {
                            gp('diario');
                            setTimeout(() => journalManager.selectEntry(entry.id), 100);
                        }
                    });
                }
            });
        } catch (e) {}

        this.renderResults();
    }

    // Verificar si el texto coincide con la búsqueda
    matches(text) {
        return text && text.toLowerCase().includes(this.currentQuery);
    }

    // Obtener preview del texto
    getPreview(text) {
        if (!text) return '';
        const maxLength = 100;
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    // Renderizar interfaz de búsqueda
    renderSearch() {
        const container = document.getElementById('search-container');
        if (!container) return;

        container.innerHTML = `
            <div class="search-input-container">
                <input type="text" id="global-search" placeholder="Buscar en toda la app..." class="search-input">
                <button class="search-btn" onclick="searchManager.search(document.getElementById('global-search').value)">🔍</button>
            </div>
            <div id="search-results" class="search-results">
                <!-- Results will be rendered here -->
            </div>
        `;

        // Event listener para búsqueda en tiempo real
        const input = document.getElementById('global-search');
        let timeout;
        input.addEventListener('input', () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                this.search(input.value);
            }, 300);
        });
    }

    // Renderizar resultados
    renderResults() {
        const container = document.getElementById('search-results');
        if (!container) return;

        if (this.results.length === 0 && this.currentQuery) {
            container.innerHTML = '<div class="search-empty">No se encontraron resultados</div>';
            return;
        }

        if (this.results.length === 0) {
            container.innerHTML = '<div class="search-empty">Escribe algo para buscar</div>';
            return;
        }

        // Agrupar por categoría
        const grouped = this.results.reduce((acc, result) => {
            if (!acc[result.category]) acc[result.category] = [];
            acc[result.category].push(result);
            return acc;
        }, {});

        container.innerHTML = Object.entries(grouped).map(([category, items]) => `
            <div class="search-category">
                <h4>${category}</h4>
                ${items.map(item => `
                    <div class="search-item" onclick="this.querySelector('.search-action').click()">
                        <div class="search-item-icon">${item.icon}</div>
                        <div class="search-item-content">
                            <div class="search-item-title">${this.highlightMatches(item.title)}</div>
                            <div class="search-item-preview">${this.highlightMatches(item.content)}</div>
                        </div>
                        <button class="search-action" onclick="event.stopPropagation(); ${item.action.toString().replace('() => ', '')}()">Ir</button>
                    </div>
                `).join('')}
            </div>
        `).join('');
    }

    // Resaltar coincidencias en el texto
    highlightMatches(text) {
        if (!text || !this.currentQuery) return text;
        const regex = new RegExp(`(${this.currentQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
    }

    // Limpiar búsqueda
    clear() {
        this.results = [];
        this.currentQuery = '';
        const input = document.getElementById('global-search');
        if (input) input.value = '';
        this.renderResults();
    }
}

// Instancia global
const searchManager = new SearchManager();