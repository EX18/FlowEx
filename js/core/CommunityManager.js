class CommunityManager {
    constructor() {
        this.suggestions = [];
        this.votes = {};
        this.userVotes = {};
        this.categories = ['features', 'bugs', 'ui-ux', 'performance', 'integrations', 'other'];
        this.currentFilter = 'all';
        this.currentSort = 'votes';
    }

    async init() {
        await this.loadData();
        this.render();
        this.attachEventListeners();
    }

    async loadData() {
        try {
            const suggestionsData = await idb.get('community-suggestions');
            const votesData = await idb.get('community-votes');
            const userVotesData = await idb.get('community-user-votes');

            if (suggestionsData) this.suggestions = suggestionsData;
            if (votesData) this.votes = votesData;
            if (userVotesData) this.userVotes = userVotesData;
        } catch (e) {
            console.warn('Error loading community data:', e);
        }
    }

    async saveData() {
        try {
            await idb.set('community-suggestions', this.suggestions);
            await idb.set('community-votes', this.votes);
            await idb.set('community-user-votes', this.userVotes);
        } catch (e) {
            console.warn('Error saving community data:', e);
        }
    }

    render() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="community-container">
                <div class="community-header">
                    <div class="community-title">🌍 Comunidad FlowEX</div>
                    <div class="community-subtitle">Tus ideas hacen que FlowEX sea mejor</div>
                </div>

                <div class="community-stats">
                    <div class="community-stat-card">
                        <div class="community-stat-icon">💡</div>
                        <div class="community-stat-value">${this.suggestions.length}</div>
                        <div class="community-stat-label">Ideas</div>
                    </div>
                    <div class="community-stat-card">
                        <div class="community-stat-icon">👍</div>
                        <div class="community-stat-value">${this.getTotalVotes()}</div>
                        <div class="community-stat-label">Votos</div>
                    </div>
                    <div class="community-stat-card">
                        <div class="community-stat-icon">🎯</div>
                        <div class="community-stat-value">${this.getImplementedCount()}</div>
                        <div class="community-stat-label">Implementadas</div>
                    </div>
                    <div class="community-stat-card">
                        <div class="community-stat-icon">🚀</div>
                        <div class="community-stat-value">${this.getInProgressCount()}</div>
                        <div class="community-stat-label">En Progreso</div>
                    </div>
                </div>

                <div class="community-controls">
                    <div class="community-filters">
                        <button class="community-filter-btn ${this.currentFilter === 'all' ? 'active' : ''}" onclick="communityManager.setFilter('all')">
                            Todas
                        </button>
                        ${this.categories.map(cat => `
                            <button class="community-filter-btn ${this.currentFilter === cat ? 'active' : ''}" onclick="communityManager.setFilter('${cat}')">
                                ${this.getCategoryName(cat)}
                            </button>
                        `).join('')}
                    </div>

                    <div class="community-sort">
                        <select id="community-sort" onchange="communityManager.setSort(this.value)">
                            <option value="votes" ${this.currentSort === 'votes' ? 'selected' : ''}>Más votadas</option>
                            <option value="recent" ${this.currentSort === 'recent' ? 'selected' : ''}>Más recientes</option>
                            <option value="trending" ${this.currentSort === 'trending' ? 'selected' : ''}>Tendencia</option>
                        </select>
                    </div>
                </div>

                <div class="community-new-idea">
                    <button class="community-new-btn" onclick="communityManager.showNewIdeaForm()">
                        💡 Compartir Nueva Idea
                    </button>
                </div>

                <div id="community-suggestions-list" class="community-suggestions-list">
                    ${this.renderSuggestions()}
                </div>

                <div class="community-roadmap">
                    <div class="community-roadmap-title">🗺️ Roadmap Público</div>
                    <div class="community-roadmap-content">
                        ${this.renderRoadmap()}
                    </div>
                </div>
            </div>
        `;
    }

    getCategoryName(category) {
        const names = {
            'features': 'Features',
            'bugs': 'Bugs',
            'ui-ux': 'UI/UX',
            'performance': 'Performance',
            'integrations': 'Integraciones',
            'other': 'Otros'
        };
        return names[category] || category;
    }

    getTotalVotes() {
        return Object.values(this.votes).reduce((sum, votes) => sum + (votes || 0), 0);
    }

    getImplementedCount() {
        return this.suggestions.filter(s => s.status === 'implemented').length;
    }

    getInProgressCount() {
        return this.suggestions.filter(s => s.status === 'in-progress').length;
    }

    renderSuggestions() {
        let filtered = this.suggestions;

        if (this.currentFilter !== 'all') {
            filtered = filtered.filter(s => s.category === this.currentFilter);
        }

        filtered = this.sortSuggestions(filtered);

        if (filtered.length === 0) {
            return `
                <div class="community-empty">
                    <div class="community-empty-icon">💭</div>
                    <div class="community-empty-title">No hay ideas aún</div>
                    <div class="community-empty-text">Sé el primero en compartir una idea para mejorar FlowEX</div>
                </div>
            `;
        }

        return filtered.map(suggestion => `
            <div class="community-suggestion-card" data-id="${suggestion.id}">
                <div class="community-suggestion-header">
                    <div class="community-suggestion-category">${this.getCategoryName(suggestion.category)}</div>
                    <div class="community-suggestion-status status-${suggestion.status}">${this.getStatusName(suggestion.status)}</div>
                </div>

                <div class="community-suggestion-content">
                    <div class="community-suggestion-title">${suggestion.title}</div>
                    <div class="community-suggestion-description">${suggestion.description}</div>
                    <div class="community-suggestion-author">Por ${suggestion.author} • ${this.formatDate(suggestion.createdAt)}</div>
                </div>

                <div class="community-suggestion-actions">
                    <button class="community-vote-btn ${this.hasUserVoted(suggestion.id) ? 'voted' : ''}"
                            onclick="communityManager.toggleVote('${suggestion.id}')">
                        👍 ${this.votes[suggestion.id] || 0}
                    </button>
                    <button class="community-comment-btn" onclick="communityManager.showComments('${suggestion.id}')">
                        💬 ${suggestion.comments?.length || 0}
                    </button>
                    <button class="community-share-btn" onclick="communityManager.shareSuggestion('${suggestion.id}')">
                        📤
                    </button>
                </div>

                ${suggestion.comments && suggestion.comments.length > 0 ? `
                    <div class="community-suggestion-comments" id="comments-${suggestion.id}" style="display: none;">
                        ${suggestion.comments.map(comment => `
                            <div class="community-comment">
                                <div class="community-comment-author">${comment.author}</div>
                                <div class="community-comment-text">${comment.text}</div>
                                <div class="community-comment-date">${this.formatDate(comment.createdAt)}</div>
                            </div>
                        `).join('')}
                        <div class="community-add-comment">
                            <input type="text" placeholder="Agregar comentario..." id="comment-input-${suggestion.id}">
                            <button onclick="communityManager.addComment('${suggestion.id}')">Enviar</button>
                        </div>
                    </div>
                ` : ''}
            </div>
        `).join('');
    }

    getStatusName(status) {
        const names = {
            'pending': 'Pendiente',
            'reviewing': 'En Revisión',
            'planned': 'Planificado',
            'in-progress': 'En Progreso',
            'implemented': 'Implementado',
            'rejected': 'Rechazado'
        };
        return names[status] || status;
    }

    sortSuggestions(suggestions) {
        return suggestions.sort((a, b) => {
            switch (this.currentSort) {
                case 'votes':
                    return (this.votes[b.id] || 0) - (this.votes[a.id] || 0);
                case 'recent':
                    return new Date(b.createdAt) - new Date(a.createdAt);
                case 'trending':
                    // Simple trending algorithm: recent votes + recency
                    const aScore = (this.votes[a.id] || 0) + (Date.now() - new Date(a.createdAt)) / 86400000;
                    const bScore = (this.votes[b.id] || 0) + (Date.now() - new Date(b.createdAt)) / 86400000;
                    return bScore - aScore;
                default:
                    return 0;
            }
        });
    }

    renderRoadmap() {
        const roadmapItems = [
            { phase: 'Q2 2026', items: ['AI Mentor Avanzado', 'Sistema de Notificaciones Inteligentes'] },
            { phase: 'Q3 2026', items: ['Gamificación Completa', 'Integraciones Externas'] },
            { phase: 'Q4 2026', items: ['Modo Colaborativo', 'Analytics Predictivos'] },
            { phase: 'Q1 2027', items: ['Control por Voz', 'Realidad Aumentada'] }
        ];

        return roadmapItems.map(phase => `
            <div class="community-roadmap-phase">
                <div class="community-roadmap-phase-title">${phase.phase}</div>
                <div class="community-roadmap-phase-items">
                    ${phase.items.map(item => `<div class="community-roadmap-item">• ${item}</div>`).join('')}
                </div>
            </div>
        `).join('');
    }

    attachEventListeners() {
        // Event listeners are attached via onclick attributes in HTML
    }

    setFilter(filter) {
        this.currentFilter = filter;
        this.render();
    }

    setSort(sort) {
        this.currentSort = sort;
        this.render();
    }

    showNewIdeaForm() {
        const form = `
            <div class="community-modal-overlay" onclick="communityManager.hideModal()">
                <div class="community-modal" onclick="event.stopPropagation()">
                    <div class="community-modal-header">
                        <div class="community-modal-title">💡 Compartir Nueva Idea</div>
                        <button class="community-modal-close" onclick="communityManager.hideModal()">✕</button>
                    </div>
                    <div class="community-modal-body">
                        <div class="community-form-group">
                            <label>Título de la idea</label>
                            <input type="text" id="idea-title" placeholder="Ej: Sistema de recordatorios inteligentes">
                        </div>
                        <div class="community-form-group">
                            <label>Categoría</label>
                            <select id="idea-category">
                                ${this.categories.map(cat => `<option value="${cat}">${this.getCategoryName(cat)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="community-form-group">
                            <label>Descripción</label>
                            <textarea id="idea-description" placeholder="Describe tu idea en detalle..." rows="4"></textarea>
                        </div>
                        <div class="community-form-group">
                            <label>¿Por qué sería útil?</label>
                            <textarea id="idea-benefit" placeholder="Explica cómo beneficiaría a los usuarios..." rows="3"></textarea>
                        </div>
                    </div>
                    <div class="community-modal-footer">
                        <button class="community-btn-secondary" onclick="communityManager.hideModal()">Cancelar</button>
                        <button class="community-btn-primary" onclick="communityManager.submitIdea()">Enviar Idea</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', form);
    }

    hideModal() {
        const modal = document.querySelector('.community-modal-overlay');
        if (modal) modal.remove();
    }

    async submitIdea() {
        const title = document.getElementById('idea-title').value.trim();
        const category = document.getElementById('idea-category').value;
        const description = document.getElementById('idea-description').value.trim();
        const benefit = document.getElementById('idea-benefit').value.trim();

        if (!title || !description) {
            toast('Por favor completa título y descripción', 'error');
            return;
        }

        const idea = {
            id: uid(),
            title,
            category,
            description,
            benefit,
            author: S.name || CUR_USER || 'Usuario Anónimo',
            createdAt: new Date().toISOString(),
            status: 'pending',
            comments: []
        };

        this.suggestions.unshift(idea);
        await this.saveData();
        this.hideModal();
        this.render();

        toast('¡Idea compartida! Gracias por tu contribución.', 'success');
    }

    async toggleVote(suggestionId) {
        const userId = CUR_USER || 'anonymous';
        const userVotes = this.userVotes[userId] || {};

        if (userVotes[suggestionId]) {
            // Remove vote
            this.votes[suggestionId] = (this.votes[suggestionId] || 0) - 1;
            delete userVotes[suggestionId];
        } else {
            // Add vote
            this.votes[suggestionId] = (this.votes[suggestionId] || 0) + 1;
            userVotes[suggestionId] = true;
        }

        this.userVotes[userId] = userVotes;
        await this.saveData();
        this.render();
    }

    hasUserVoted(suggestionId) {
        const userId = CUR_USER || 'anonymous';
        return this.userVotes[userId]?.[suggestionId] || false;
    }

    showComments(suggestionId) {
        const commentsEl = document.getElementById(`comments-${suggestionId}`);
        if (commentsEl) {
            commentsEl.style.display = commentsEl.style.display === 'none' ? 'block' : 'none';
        }
    }

    async addComment(suggestionId) {
        const input = document.getElementById(`comment-input-${suggestionId}`);
        const text = input.value.trim();

        if (!text) return;

        const suggestion = this.suggestions.find(s => s.id === suggestionId);
        if (!suggestion) return;

        if (!suggestion.comments) suggestion.comments = [];

        suggestion.comments.push({
            id: uid(),
            text,
            author: S.name || CUR_USER || 'Usuario Anónimo',
            createdAt: new Date().toISOString()
        });

        input.value = '';
        await this.saveData();
        this.render();
    }

    shareSuggestion(suggestionId) {
        const suggestion = this.suggestions.find(s => s.id === suggestionId);
        if (!suggestion) return;

        const shareText = `💡 Idea para FlowEX: "${suggestion.title}"\n\n${suggestion.description}\n\n¿Te gusta? Vótala en la comunidad de FlowEX!`;
        const shareUrl = window.location.href;

        if (navigator.share) {
            navigator.share({
                title: `Idea para FlowEX: ${suggestion.title}`,
                text: shareText,
                url: shareUrl
            });
        } else {
            // Fallback: copy to clipboard
            navigator.clipboard.writeText(`${shareText}\n\n${shareUrl}`).then(() => {
                toast('Idea copiada al portapapeles', 'success');
            });
        }
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}min`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;

        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    }

    // Admin functions (for development/testing)
    async addSampleData() {
        const sampleSuggestions = [
            {
                id: uid(),
                title: 'Sistema de gamificación completo',
                category: 'features',
                description: 'Agregar logros, niveles, recompensas y competiciones para motivar la consistencia',
                benefit: 'Aumentaría significativamente el engagement y la retención de usuarios',
                author: 'Usuario Beta',
                createdAt: new Date(Date.now() - 86400000).toISOString(),
                status: 'implemented',
                comments: [
                    {
                        id: uid(),
                        text: '¡Excelente idea! Ya estoy emocionado',
                        author: 'Usuario 1',
                        createdAt: new Date(Date.now() - 43200000).toISOString()
                    }
                ]
            },
            {
                id: uid(),
                title: 'Integración con Google Calendar',
                category: 'integrations',
                description: 'Sincronización bidireccional con Google Calendar para eventos y recordatorios',
                benefit: 'Permitiría una mejor integración con el flujo de trabajo diario',
                author: 'Power User',
                createdAt: new Date(Date.now() - 172800000).toISOString(),
                status: 'in-progress',
                comments: []
            },
            {
                id: uid(),
                title: 'Modo oscuro mejorado',
                category: 'ui-ux',
                description: 'Implementar un modo oscuro más sofisticado con temas personalizables',
                benefit: 'Mejoraría la experiencia visual y reduciría la fatiga ocular',
                author: 'Designer',
                createdAt: new Date(Date.now() - 259200000).toISOString(),
                status: 'planned',
                comments: []
            }
        ];

        this.suggestions = [...sampleSuggestions, ...this.suggestions];

        // Add some votes
        sampleSuggestions.forEach(suggestion => {
            this.votes[suggestion.id] = Math.floor(Math.random() * 25) + 5;
        });

        await this.saveData();
        this.render();
        toast('Datos de ejemplo agregados', 'success');
    }
}