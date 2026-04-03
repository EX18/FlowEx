class UpdatesManager {
    constructor() {
        this.updates = [];
        this.announcements = [];
        this.changelog = [];
        this.settings = {
            notifyOnUpdate: true,
            notifyOnAnnouncement: true,
            readUpdates: [],
            lastCheckedAt: null
        };
        this.updateCheckInterval = null;
    }

    async init() {
        await this.loadData();
        this.initializeDefaultUpdates();
        this.render();
        this.attachEventListeners();
        this.startUpdateCheck();
    }

    async loadData() {
        try {
            const settings = await idb.get('updates-settings');
            const updates = await idb.get('updates-data');
            const changelog = await idb.get('updates-changelog');

            if (settings) this.settings = { ...this.settings, ...settings };
            if (updates) this.updates = updates;
            if (changelog) this.changelog = changelog;
        } catch (e) {
            console.warn('Error loading updates data:', e);
        }
    }

    async saveData() {
        try {
            await idb.set('updates-settings', this.settings);
            await idb.set('updates-data', this.updates);
            await idb.set('updates-changelog', this.changelog);
        } catch (e) {
            console.warn('Error saving updates data:', e);
        }
    }

    initializeDefaultUpdates() {
        if (this.changelog.length > 0) return;

        this.changelog = [
            {
                id: uid(),
                version: '2.8.0',
                date: '2026-04-03',
                title: 'Sistema de Notificaciones Ultra-Inteligente',
                description: 'Sistema predictivo avanzado de recordatorios y alertas personalizadas',
                features: [
                    'Análisis de patrones para recordatorios predictivos',
                    'Horas de silencio personalizables',
                    'Alertas de bienestar basadas en IA',
                    'Resúmenes diarios y semanales',
                    'Historial completo de notificaciones'
                ],
                type: 'major',
                highlighted: true
            },
            {
                id: uid(),
                version: '2.7.0',
                date: '2026-04-02',
                title: 'Comunidad FlowEX',
                description: 'Sistema democrático de ideas y sugerencias de usuarios',
                features: [
                    'Compartir ideas y sugerencias',
                    'Sistema de votación comunitaria',
                    'Comentarios y discusiones',
                    'Roadmap público visible',
                    'Categorización de ideas',
                    'Estados de implementación'
                ],
                type: 'major',
                highlighted: true
            },
            {
                id: uid(),
                version: '2.6.0',
                date: '2026-03-28',
                title: 'AI Mentor Avanzado',
                description: 'Coach de productividad inteligente con análisis profundo',
                features: [
                    'Análisis inteligente de productividad',
                    'Generación automática de sugerencias',
                    'Conversaciones contextuales',
                    'Insights predictivos sobre hábitos',
                    'Panel de análisis interactivo'
                ],
                type: 'major',
                highlighted: true
            },
            {
                id: uid(),
                version: '2.5.0',
                date: '2026-03-20',
                title: 'Búsqueda Global',
                description: 'Motor de búsqueda avanzado en toda la app',
                features: [
                    'Búsqueda en tiempo real',
                    'Búsqueda por categoría',
                    'Destaque de resultados',
                    'Historial de búsquedas'
                ],
                type: 'feature'
            },
            {
                id: uid(),
                version: '2.4.0',
                date: '2026-03-15',
                title: 'Time Tracker Profesional',
                description: 'Seguimiento avanzado de tiempo con estadísticas',
                features: [
                    'Registros de tiempo en tiempo real',
                    'Categorización de actividades',
                    'Estadísticas y reportes',
                    'Exportación de datos'
                ],
                type: 'feature'
            },
            {
                id: uid(),
                version: '2.3.0',
                date: '2026-03-10',
                title: 'Diario Inteligente',
                description: 'Entradas de diario con análisis de estado de ánimo',
                features: [
                    'Entradas en formato markdown',
                    'Análisis de estado de ánimo',
                    'Conteo de racha de días',
                    'Galería de fotos'
                ],
                type: 'feature'
            },
            {
                id: uid(),
                version: '2.2.0',
                date: '2026-03-05',
                title: 'Gestor de Proyectos',
                description: 'Gestión completa de proyectos con hitos',
                features: [
                    'CRUD de proyectos',
                    'Sistema de hitos',
                    'Seguimiento de progreso',
                    'Asignación de tareas'
                ],
                type: 'feature'
            }
        ];

        this.announcements = [
            {
                id: uid(),
                title: '🎉 ¡Bienvenido a FlowEX 2.8!',
                message: 'El sistema de notificaciones inteligentes está aquí para ayudarte a ser más productivo.',
                type: 'feature',
                icon: '🚀',
                date: new Date().toISOString(),
                important: true,
                action: 'Descubre',
                actionLink: 'notificaciones'
            },
            {
                id: uid(),
                title: '👥 Tu voz importa - Comunidad FlowEX',
                message: 'Comparte tus ideas y vota por las características que quieres ver en FlowEX.',
                type: 'community',
                icon: '🌍',
                date: new Date(Date.now() - 86400000).toISOString(),
                important: true,
                action: 'Ir a Comunidad',
                actionLink: 'comunidad'
            }
        ];

        this.updates = [
            {
                id: uid(),
                title: 'Actualizaciones Recientes',
                content: 'Se han agregado 3 módulos nuevos a FlowEX:',
                timestamp: new Date().toISOString(),
                read: false,
                important: true,
                category: 'update'
            }
        ];
    }

    render() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="updates-container">
                <div class="updates-header">
                    <div class="updates-title">📢 Centro de Actualizaciones</div>
                    <div class="updates-subtitle">Entérate de todas las novedades y cambios en FlowEX</div>
                </div>

                <div class="updates-tabs">
                    <button class="updates-tab-btn active" onclick="updatesManager.switchTab('announcements')">
                        📣 Anuncios (${this.getUnreadCount('announcements')})
                    </button>
                    <button class="updates-tab-btn" onclick="updatesManager.switchTab('changelog')">
                        📋 Historial (${this.changelog.length})
                    </button>
                    <button class="updates-tab-btn" onclick="updatesManager.switchTab('notifications')">
                        🔔 Notificaciones (${this.getUnreadCount('notifications')})
                    </button>
                </div>

                <div id="updates-content" class="updates-content">
                    ${this.renderAnnouncements()}
                </div>

                <div class="updates-settings">
                    <div class="updates-settings-title">⚙️ Preferencias de Notificaciones</div>
                    <div class="updates-setting-item">
                        <label class="updates-toggle">
                            <input type="checkbox" id="notify-updates" ${this.settings.notifyOnUpdate ? 'checked' : ''}>
                            <span class="updates-toggle-slider"></span>
                        </label>
                        <span class="updates-setting-label">Notificar en actualizaciones</span>
                    </div>
                    <div class="updates-setting-item">
                        <label class="updates-toggle">
                            <input type="checkbox" id="notify-announcements" ${this.settings.notifyOnAnnouncement ? 'checked' : ''}>
                            <span class="updates-toggle-slider"></span>
                        </label>
                        <span class="updates-setting-label">Notificar anuncios importantes</span>
                    </div>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    renderAnnouncements() {
        if (this.announcements.length === 0) {
            return `
                <div class="updates-empty">
                    <div class="updates-empty-icon">📭</div>
                    <div class="updates-empty-title">Sin anuncios</div>
                    <div class="updates-empty-text">No hay anuncios importantes en este momento</div>
                </div>
            `;
        }

        return `
            <div class="updates-list">
                ${this.announcements.map(announcement => `
                    <div class="updates-card ${announcement.important ? 'important' : ''}">
                        <div class="updates-card-header">
                            <div class="updates-card-icon">${announcement.icon}</div>
                            <div class="updates-card-title">${announcement.title}</div>
                            <div class="updates-card-type">${this.getTypeLabel(announcement.type)}</div>
                        </div>
                        <div class="updates-card-content">
                            ${announcement.message}
                        </div>
                        <div class="updates-card-footer">
                            <div class="updates-card-date">${this.formatTime(announcement.date)}</div>
                            ${announcement.action ? `
                                <button class="updates-card-action" onclick="gp('${announcement.actionLink}')">
                                    ${announcement.action} →
                                </button>
                            ` : ''}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderChangelog() {
        return `
            <div class="updates-list">
                ${this.changelog.map(release => `
                    <div class="changelog-card ${release.highlighted ? 'highlighted' : ''}">
                        <div class="changelog-header">
                            <div class="changelog-version">v${release.version}</div>
                            <div class="changelog-type">${this.getTypeLabel(release.type)}</div>
                            <div class="changelog-date">${this.formatDate(release.date)}</div>
                        </div>
                        <div class="changelog-title">${release.title}</div>
                        <div class="changelog-description">${release.description}</div>
                        <div class="changelog-features">
                            <div class="changelog-features-label">Lo nuevo:</div>
                            <ul>
                                ${release.features.map(feature => `<li>✓ ${feature}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    renderNotifications() {
        if (this.updates.length === 0) {
            return `
                <div class="updates-empty">
                    <div class="updates-empty-icon">✨</div>
                    <div class="updates-empty-title">Todo al día</div>
                    <div class="updates-empty-text">No hay notificaciones nuevas. ¡Estás al tanto de todo!</div>
                </div>
            `;
        }

        return `
            <div class="updates-list">
                ${this.updates.map(update => `
                    <div class="updates-notification-card ${update.read ? 'read' : 'unread'}">
                        <div class="updates-notification-dot ${update.read ? '' : 'new'}"></div>
                        <div class="updates-notification-content">
                            <div class="updates-notification-title">${update.title}</div>
                            <div class="updates-notification-text">${update.content}</div>
                            <div class="updates-notification-time">${this.formatTime(update.timestamp)}</div>
                        </div>
                        <button class="updates-mark-btn" onclick="updatesManager.markAsRead('${update.id}')">
                            ${update.read ? '✓ Leído' : 'Marcar leído'}
                        </button>
                    </div>
                `).join('')}
            </div>
        `;
    }

    switchTab(tabName) {
        const content = document.getElementById('updates-content');
        const buttons = document.querySelectorAll('.updates-tab-btn');

        buttons.forEach(btn => btn.classList.remove('active'));
        event.target.classList.add('active');

        let html = '';
        switch (tabName) {
            case 'announcements':
                html = this.renderAnnouncements();
                break;
            case 'changelog':
                html = this.renderChangelog();
                break;
            case 'notifications':
                html = this.renderNotifications();
                break;
        }

        if (content) content.innerHTML = html;
    }

    getTypeLabel(type) {
        const labels = {
            'feature': '✨ Feature',
            'bugfix': '🐛 Fix',
            'improvement': '⚡ Mejora',
            'major': '🚀 Mayor',
            'community': '👥 Comunidad',
            'security': '🔒 Seguridad'
        };
        return labels[type] || type;
    }

    getUnreadCount(type) {
        if (type === 'announcements') {
            return this.announcements.filter(a => !a.read).length;
        } else if (type === 'notifications') {
            return this.updates.filter(u => !u.read).length;
        }
        return 0;
    }

    async markAsRead(id) {
        const update = this.updates.find(u => u.id === id);
        if (update) {
            update.read = true;
            await this.saveData();
            this.render();
            await this.init();
        }
    }

    formatDate(dateStr) {
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-ES', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }

    formatTime(dateStr) {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}min`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;
        if (diff < 604800000) return `Hace ${Math.floor(diff / 86400000)}d`;

        return this.formatDate(dateStr);
    }

    attachEventListeners() {
        document.getElementById('notify-updates')?.addEventListener('change', (e) => {
            this.settings.notifyOnUpdate = e.target.checked;
            this.saveData();
        });

        document.getElementById('notify-announcements')?.addEventListener('change', (e) => {
            this.settings.notifyOnAnnouncement = e.target.checked;
            this.saveData();
        });
    }

    startUpdateCheck() {
        // Check for important updates every hour
        this.updateCheckInterval = setInterval(() => {
            this.checkForNewUpdates();
        }, 60 * 60 * 1000);

        // Initial check
        this.checkForNewUpdates();
    }

    async checkForNewUpdates() {
        // In a real app, this would hit an API endpoint
        // For demo purposes, we'll check if there are unread items
        const unread = this.announcements.filter(a => !a.read).length;
        if (unread > 0 && this.settings.notifyOnAnnouncement) {
            this.showUpdateNotification();
        }
    }

    async showUpdateNotification() {
        const total = this.announcements.filter(a => !a.read).length;
        if (total > 0) {
            await showNotification('📢 Nuevos Anuncios', {
                body: `Tienes ${total} anuncio${total > 1 ? 's' : ''} nuevo${total > 1 ? 's' : ''} sobre FlowEX`,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: 'updates'
            });
        }
    }

    // Función para agregar nuevas actualizaciones desde el admin
    async addUpdate(title, content, category = 'update', important = false) {
        const update = {
            id: uid(),
            title,
            content,
            timestamp: new Date().toISOString(),
            read: false,
            important,
            category
        };

        this.updates.unshift(update);
        await this.saveData();

        if (this.settings.notifyOnUpdate) {
            await this.showUpdateNotification();
        }

        return update.id;
    }

    // Función para agregar anuncios desde el admin
    async addAnnouncement(title, message, type = 'feature', action = null, actionLink = null) {
        const announcement = {
            id: uid(),
            title,
            message,
            type,
            icon: this.getIconForType(type),
            date: new Date().toISOString(),
            important: type === 'feature' || type === 'community',
            read: false,
            action,
            actionLink
        };

        this.announcements.unshift(announcement);
        await this.saveData();

        if (this.settings.notifyOnAnnouncement) {
            await this.showUpdateNotification();
        }

        return announcement.id;
    }

    getIconForType(type) {
        const icons = {
            'feature': '✨',
            'bugfix': '🐛',
            'improvement': '⚡',
            'community': '👥',
            'security': '🔒',
            'announcement': '📣'
        };
        return icons[type] || '📢';
    }

    // Función para hacer toast con actualizaciones
    async notifyUpdateImportant(title, message) {
        toast(title, 'success');
        await this.addUpdate(title, message, 'update', true);
    }

    stopUpdateCheck() {
        if (this.updateCheckInterval) {
            clearInterval(this.updateCheckInterval);
        }
    }
}

// Exportar para uso global
window.updatesManager = null;
window.initUpdates = async () => {
    if (!window.updatesManager) {
        window.updatesManager = new UpdatesManager();
    }
    await window.updatesManager.init();
};