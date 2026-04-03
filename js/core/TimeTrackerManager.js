// TimeTrackerManager.js - Seguimiento detallado de tiempo
class TimeTrackerManager {
    constructor() {
        this.sessions = [];
        this.currentSession = null;
        this.timer = null;
        this.startTime = null;
    }

    // Inicializar desde storage
    async init() {
        const data = await idbGet('timeSessions') || [];
        this.sessions = data;
        this.renderTimeTracker();
        this.updateStats();
    }

    // Iniciar sesión de tiempo
    startSession(data) {
        if (this.currentSession) {
            this.stopSession();
        }

        this.currentSession = {
            id: uid(),
            taskId: data.taskId,
            projectId: data.projectId,
            description: data.description || '',
            startTime: Date.now(),
            endTime: null,
            duration: 0,
            tags: data.tags || [],
            billable: data.billable || false
        };

        this.startTime = Date.now();
        this.startTimer();
        this.save();
        this.renderTimeTracker();
    }

    // Detener sesión actual
    stopSession() {
        if (!this.currentSession) return;

        this.currentSession.endTime = Date.now();
        this.currentSession.duration = this.currentSession.endTime - this.currentSession.startTime;

        this.sessions.push(this.currentSession);
        this.currentSession = null;
        this.stopTimer();
        this.save();
        this.renderTimeTracker();
        this.updateStats();
    }

    // Pausar/reanudar
    togglePause() {
        if (!this.currentSession) return;

        if (this.timer) {
            this.stopTimer();
        } else {
            this.startTimer();
        }
    }

    // Iniciar timer
    startTimer() {
        this.timer = setInterval(() => {
            this.updateDisplay();
        }, 1000);
        this.updateDisplay();
    }

    // Detener timer
    stopTimer() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    // Actualizar display del timer
    updateDisplay() {
        if (!this.currentSession) return;

        const elapsed = Date.now() - this.startTime;
        const hours = Math.floor(elapsed / 3600000);
        const minutes = Math.floor((elapsed % 3600000) / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);

        const display = document.getElementById('timer-display');
        if (display) {
            display.textContent = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
    }

    // Guardar a storage
    async save() {
        await idbSet('timeSessions', this.sessions);
    }

    // Renderizar interfaz
    renderTimeTracker() {
        this.renderCurrentSession();
        this.renderSessionsList();
    }

    // Renderizar sesión actual
    renderCurrentSession() {
        const container = document.getElementById('current-session');
        if (!container) return;

        if (this.currentSession) {
            container.innerHTML = `
                <div class="current-session-active">
                    <div class="session-info">
                        <h3>${this.currentSession.description || 'Sesión activa'}</h3>
                        <div class="session-timer" id="timer-display">00:00:00</div>
                    </div>
                    <div class="session-controls">
                        <button class="btn-secondary" onclick="timeTrackerManager.togglePause()">
                            ${this.timer ? '⏸️ Pausar' : '▶️ Reanudar'}
                        </button>
                        <button class="btn-danger" onclick="timeTrackerManager.stopSession()">
                            ⏹️ Detener
                        </button>
                    </div>
                </div>
            `;
        } else {
            container.innerHTML = `
                <div class="current-session-inactive">
                    <div class="session-start">
                        <input type="text" id="session-description" placeholder="¿En qué vas a trabajar?">
                        <button class="btn-primary" onclick="timeTrackerManager.startNewSession()">
                            ▶️ Iniciar
                        </button>
                    </div>
                </div>
            `;
        }
    }

    // Iniciar nueva sesión desde input
    startNewSession() {
        const description = document.getElementById('session-description').value.trim();
        if (!description) return;

        this.startSession({ description });
        document.getElementById('session-description').value = '';
    }

    // Renderizar lista de sesiones
    renderSessionsList() {
        const container = document.getElementById('sessions-list');
        if (!container) return;

        // Mostrar últimas 10 sesiones
        const recentSessions = this.sessions.slice(-10).reverse();

        container.innerHTML = recentSessions.map(session => `
            <div class="session-item">
                <div class="session-item-info">
                    <h4>${session.description}</h4>
                    <div class="session-meta">
                        <span>${new Date(session.startTime).toLocaleDateString()}</span>
                        <span>${this.formatDuration(session.duration)}</span>
                        ${session.tags.length ? `<span class="session-tags">${session.tags.join(', ')}</span>` : ''}
                    </div>
                </div>
                <div class="session-item-actions">
                    <button class="btn-small" onclick="timeTrackerManager.editSession('${session.id}')">✏️</button>
                    <button class="btn-small danger" onclick="timeTrackerManager.deleteSession('${session.id}')">🗑️</button>
                </div>
            </div>
        `).join('');
    }

    // Formatear duración
    formatDuration(ms) {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        const seconds = Math.floor((ms % 60000) / 1000);

        if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m ${seconds}s`;
        }
    }

    // Eliminar sesión
    deleteSession(id) {
        this.sessions = this.sessions.filter(s => s.id !== id);
        this.save();
        this.renderTimeTracker();
        this.updateStats();
    }

    // Actualizar estadísticas
    updateStats() {
        const stats = this.calculateStats();

        const totalEl = document.getElementById('time-total');
        const todayEl = document.getElementById('time-today');
        const weekEl = document.getElementById('time-week');

        if (totalEl) totalEl.textContent = this.formatDuration(stats.total);
        if (todayEl) todayEl.textContent = this.formatDuration(stats.today);
        if (weekEl) weekEl.textContent = this.formatDuration(stats.week);
    }

    // Calcular estadísticas
    calculateStats() {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());

        let total = 0;
        let todayTotal = 0;
        let weekTotal = 0;

        this.sessions.forEach(session => {
            const sessionDate = new Date(session.startTime);
            total += session.duration;

            if (sessionDate >= today) {
                todayTotal += session.duration;
            }

            if (sessionDate >= weekStart) {
                weekTotal += session.duration;
            }
        });

        return { total, today: todayTotal, week: weekTotal };
    }

    // Mostrar formulario para editar sesión
    editSession(id) {
        const session = this.sessions.find(s => s.id === id);
        if (!session) return;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Editar sesión</h3>
                <form onsubmit="timeTrackerManager.updateSessionForm(event, '${id}')">
                    <input type="text" name="description" value="${session.description}" required>
                    <input type="text" name="tags" value="${session.tags.join(', ')}" placeholder="Etiquetas separadas por coma">
                    <label>
                        <input type="checkbox" name="billable" ${session.billable ? 'checked' : ''}>
                        Facturable
                    </label>
                    <div class="modal-actions">
                        <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button type="submit" class="btn-primary">Guardar</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Actualizar sesión desde formulario
    updateSessionForm(event, id) {
        event.preventDefault();
        const formData = new FormData(event.target);
        const session = this.sessions.find(s => s.id === id);
        if (session) {
            session.description = formData.get('description');
            session.tags = formData.get('tags') ? formData.get('tags').split(',').map(t => t.trim()).filter(t => t) : [];
            session.billable = formData.has('billable');
            this.save();
            this.renderTimeTracker();
        }
        event.target.closest('.modal-overlay').remove();
    }

    // Exportar datos
    exportData() {
        const data = {
            sessions: this.sessions,
            exportDate: new Date().toISOString(),
            totalTime: this.calculateStats().total
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `time-tracking-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
}

// Instancia global
const timeTrackerManager = new TimeTrackerManager();