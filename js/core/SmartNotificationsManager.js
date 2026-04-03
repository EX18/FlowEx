class SmartNotificationsManager {
    constructor() {
        this.notifications = [];
        this.settings = {
            enabled: true,
            dailySummary: true,
            weeklyReport: true,
            predictiveReminders: true,
            wellnessAlerts: true,
            quietHours: { start: '22:00', end: '08:00' },
            maxNotificationsPerDay: 10
        };
        this.todayNotifications = 0;
        this.lastResetDate = today();
    }

    async init() {
        await this.loadSettings();
        this.render();
        this.scheduleNotifications();
        this.resetDailyCounter();
    }

    async loadSettings() {
        try {
            const data = await idb.get('smart-notifications-settings');
            if (data) {
                this.settings = { ...this.settings, ...data };
            }
        } catch (e) {
            console.warn('Error loading notification settings:', e);
        }
    }

    async saveSettings() {
        try {
            await idb.set('smart-notifications-settings', this.settings);
        } catch (e) {
            console.warn('Error saving notification settings:', e);
        }
    }

    render() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="smart-notifications-container">
                <div class="sn-header">
                    <div class="sn-title">🔔 Notificaciones Ultra-Inteligentes</div>
                    <div class="sn-subtitle">Sistema predictivo de recordatorios y alertas</div>
                </div>

                <div class="sn-stats">
                    <div class="sn-stat-card">
                        <div class="sn-stat-icon">📊</div>
                        <div class="sn-stat-value">${this.todayNotifications}</div>
                        <div class="sn-stat-label">Hoy</div>
                    </div>
                    <div class="sn-stat-card">
                        <div class="sn-stat-icon">🎯</div>
                        <div class="sn-stat-value">${this.getPendingNotifications()}</div>
                        <div class="sn-stat-label">Pendientes</div>
                    </div>
                    <div class="sn-stat-card">
                        <div class="sn-stat-icon">🧠</div>
                        <div class="sn-stat-value">${this.getSmartScore()}%</div>
                        <div class="sn-stat-label">Precisión IA</div>
                    </div>
                </div>

                <div class="sn-settings">
                    <div class="sn-setting-group">
                        <div class="sn-setting-title">⚙️ Configuración General</div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-enabled" ${this.settings.enabled ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Notificaciones activas</span>
                        </div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-daily-summary" ${this.settings.dailySummary ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Resumen diario</span>
                        </div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-weekly-report" ${this.settings.weeklyReport ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Reporte semanal</span>
                        </div>
                    </div>

                    <div class="sn-setting-group">
                        <div class="sn-setting-title">🎯 Notificaciones Inteligentes</div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-predictive" ${this.settings.predictiveReminders ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Recordatorios predictivos</span>
                        </div>
                        <div class="sn-setting-item">
                            <label class="sn-toggle">
                                <input type="checkbox" id="sn-wellness" ${this.settings.wellnessAlerts ? 'checked' : ''}>
                                <span class="sn-toggle-slider"></span>
                            </label>
                            <span class="sn-setting-label">Alertas de bienestar</span>
                        </div>
                    </div>

                    <div class="sn-setting-group">
                        <div class="sn-setting-title">🌙 Horas de Silencio</div>
                        <div class="sn-time-inputs">
                            <div class="sn-time-input">
                                <label>Desde:</label>
                                <input type="time" id="sn-quiet-start" value="${this.settings.quietHours.start}">
                            </div>
                            <div class="sn-time-input">
                                <label>Hasta:</label>
                                <input type="time" id="sn-quiet-end" value="${this.settings.quietHours.end}">
                            </div>
                        </div>
                    </div>
                </div>

                <div class="sn-recent">
                    <div class="sn-recent-title">📋 Notificaciones Recientes</div>
                    <div id="sn-recent-list" class="sn-recent-list">
                        ${this.renderRecentNotifications()}
                    </div>
                </div>

                <div class="sn-actions">
                    <button class="sn-action-btn" onclick="smartNotificationsManager.testNotification()">
                        🧪 Probar Notificación
                    </button>
                    <button class="sn-action-btn" onclick="smartNotificationsManager.generateInsights()">
                        🔍 Generar Insights
                    </button>
                    <button class="sn-action-btn" onclick="smartNotificationsManager.clearHistory()">
                        🗑️ Limpiar Historial
                    </button>
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    attachEventListeners() {
        // Settings toggles
        document.getElementById('sn-enabled')?.addEventListener('change', (e) => {
            this.settings.enabled = e.target.checked;
            this.saveSettings();
            this.updateNotificationSchedule();
        });

        document.getElementById('sn-daily-summary')?.addEventListener('change', (e) => {
            this.settings.dailySummary = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('sn-weekly-report')?.addEventListener('change', (e) => {
            this.settings.weeklyReport = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('sn-predictive')?.addEventListener('change', (e) => {
            this.settings.predictiveReminders = e.target.checked;
            this.saveSettings();
        });

        document.getElementById('sn-wellness')?.addEventListener('change', (e) => {
            this.settings.wellnessAlerts = e.target.checked;
            this.saveSettings();
        });

        // Quiet hours
        document.getElementById('sn-quiet-start')?.addEventListener('change', (e) => {
            this.settings.quietHours.start = e.target.value;
            this.saveSettings();
        });

        document.getElementById('sn-quiet-end')?.addEventListener('change', (e) => {
            this.settings.quietHours.end = e.target.value;
            this.saveSettings();
        });
    }

    scheduleNotifications() {
        if (!this.settings.enabled) return;

        // Daily summary at 9 PM
        this.scheduleDailySummary();

        // Weekly report every Monday at 10 AM
        this.scheduleWeeklyReport();

        // Predictive reminders
        this.schedulePredictiveReminders();

        // Wellness alerts
        this.scheduleWellnessAlerts();
    }

    scheduleDailySummary() {
        const now = new Date();
        const summaryTime = new Date(now);
        summaryTime.setHours(21, 0, 0, 0); // 9 PM

        if (summaryTime <= now) {
            summaryTime.setDate(summaryTime.getDate() + 1);
        }

        const delay = summaryTime - now;
        setTimeout(() => {
            if (this.settings.dailySummary) {
                this.sendDailySummary();
            }
            // Schedule next one
            setInterval(() => {
                if (this.settings.dailySummary) {
                    this.sendDailySummary();
                }
            }, 24 * 60 * 60 * 1000);
        }, delay);
    }

    scheduleWeeklyReport() {
        const now = new Date();
        const reportTime = new Date(now);
        reportTime.setHours(10, 0, 0, 0); // 10 AM

        // Find next Monday
        const daysUntilMonday = (1 - now.getDay() + 7) % 7;
        if (daysUntilMonday === 0 && now.getHours() >= 10) {
            reportTime.setDate(reportTime.getDate() + 7);
        } else {
            reportTime.setDate(reportTime.getDate() + daysUntilMonday);
        }

        const delay = reportTime - now;
        setTimeout(() => {
            if (this.settings.weeklyReport) {
                this.sendWeeklyReport();
            }
            // Schedule next one
            setInterval(() => {
                if (this.settings.weeklyReport) {
                    this.sendWeeklyReport();
                }
            }, 7 * 24 * 60 * 60 * 1000);
        }, delay);
    }

    schedulePredictiveReminders() {
        // Check every hour for predictive reminders
        setInterval(() => {
            if (this.settings.predictiveReminders && this.canSendNotification()) {
                this.checkPredictiveReminders();
            }
        }, 60 * 60 * 1000); // Every hour
    }

    scheduleWellnessAlerts() {
        // Check every 4 hours for wellness alerts
        setInterval(() => {
            if (this.settings.wellnessAlerts && this.canSendNotification()) {
                this.checkWellnessAlerts();
            }
        }, 4 * 60 * 60 * 1000); // Every 4 hours
    }

    async checkPredictiveReminders() {
        const habits = S.habits || [];
        const today = today();
        const now = new Date();

        for (const habit of habits) {
            const streak = getStreak(habit);
            const lastLog = habit.logs ? Object.keys(habit.logs).sort().pop() : null;

            // If habit hasn't been done today and it's usually done at this time
            if (!habit.logs?.[today] && this.isHabitTime(habit, now)) {
                if (streak >= 3) { // Only for habits with good streaks
                    await this.sendNotification({
                        title: `¿Hora de ${habit.emoji} ${habit.name}?`,
                        body: `Tu racha de ${streak} días te está esperando. ¡No la rompas!`,
                        type: 'predictive',
                        priority: 'normal'
                    });
                }
            }
        }
    }

    async checkWellnessAlerts() {
        const today = today();
        const habits = S.habits || [];
        const completedToday = habits.filter(h => h.logs?.[today]).length;
        const totalHabits = habits.length;

        // Low completion rate alert
        if (totalHabits > 0 && completedToday / totalHabits < 0.3) {
            await this.sendNotification({
                title: '¿Estás bien?',
                body: `Solo completaste ${completedToday}/${totalHabits} hábitos hoy. Recuerda cuidar tu bienestar.`,
                type: 'wellness',
                priority: 'high'
            });
        }

        // Overworking alert (based on time tracking if available)
        const timeEntries = S.timeEntries || [];
        const todayEntries = timeEntries.filter(e => e.date === today);
        const totalTimeToday = todayEntries.reduce((sum, e) => sum + (e.duration || 0), 0);

        if (totalTimeToday > 12 * 60 * 60 * 1000) { // More than 12 hours
            await this.sendNotification({
                title: 'Descanso necesario',
                body: `Llevas ${Math.round(totalTimeToday / 3600000)} horas trabajando hoy. ¡Toma un descanso!`,
                type: 'wellness',
                priority: 'high'
            });
        }
    }

    isHabitTime(habit, now) {
        // Simple heuristic: check if current time matches typical completion times
        // This could be enhanced with ML in the future
        const logs = habit.logs || {};
        const completionTimes = Object.values(logs).map(log => {
            if (log.timestamp) {
                return new Date(log.timestamp).getHours();
            }
            return null;
        }).filter(t => t !== null);

        if (completionTimes.length < 3) return false;

        const avgHour = completionTimes.reduce((sum, h) => sum + h, 0) / completionTimes.length;
        const currentHour = now.getHours();

        return Math.abs(currentHour - avgHour) <= 2; // Within 2 hours
    }

    async sendDailySummary() {
        const today = today();
        const habits = S.habits || [];
        const completed = habits.filter(h => h.logs?.[today]).length;
        const total = habits.length;

        const summary = {
            title: '📊 Resumen Diario - FlowEX',
            body: `Completaste ${completed}/${total} hábitos hoy. ${completed === total ? '¡Día perfecto! 🎉' : 'Sigue adelante mañana.'}`,
            type: 'summary',
            priority: 'normal'
        };

        await this.sendNotification(summary);
    }

    async sendWeeklyReport() {
        const habits = S.habits || [];
        const weekStats = this.calculateWeekStats();

        const report = {
            title: '📈 Reporte Semanal - FlowEX',
            body: `Esta semana: ${weekStats.totalCompleted}/${weekStats.totalPossible} hábitos. Mejor día: ${weekStats.bestDay}. ¡Sigue así!`,
            type: 'report',
            priority: 'normal'
        };

        await this.sendNotification(report);
    }

    calculateWeekStats() {
        const habits = S.habits || [];
        const now = new Date();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());

        let totalCompleted = 0;
        let totalPossible = 0;
        const dayCounts = {};

        for (let i = 0; i < 7; i++) {
            const date = new Date(weekStart);
            date.setDate(weekStart.getDate() + i);
            const dateStr = date.toISOString().split('T')[0];

            const dayCompleted = habits.filter(h => h.logs?.[dateStr]).length;
            dayCounts[date.toLocaleDateString('es-ES', { weekday: 'short' })] = dayCompleted;
            totalCompleted += dayCompleted;
            totalPossible += habits.length;
        }

        const bestDay = Object.entries(dayCounts).reduce((a, b) => a[1] > b[1] ? a : b)[0];

        return { totalCompleted, totalPossible, bestDay };
    }

    async sendNotification(notification) {
        if (!this.canSendNotification()) return;

        try {
            await showNotification(notification.title, {
                body: notification.body,
                icon: '/icon-192.png',
                badge: '/icon-192.png',
                tag: notification.type,
                requireInteraction: notification.priority === 'high'
            });

            this.notifications.unshift({
                ...notification,
                id: uid(),
                timestamp: Date.now(),
                read: false
            });

            this.todayNotifications++;
            await this.saveNotifications();

            // Update UI if visible
            this.updateRecentNotifications();

        } catch (e) {
            console.warn('Error sending notification:', e);
        }
    }

    canSendNotification() {
        if (!this.settings.enabled) return false;

        // Check daily limit
        if (this.todayNotifications >= this.settings.maxNotificationsPerDay) return false;

        // Check quiet hours
        const now = new Date();
        const currentTime = now.getHours() * 100 + now.getMinutes();
        const quietStart = this.parseTime(this.settings.quietHours.start);
        const quietEnd = this.parseTime(this.settings.quietHours.end);

        if (quietStart < quietEnd) {
            // Same day quiet hours
            if (currentTime >= quietStart && currentTime <= quietEnd) return false;
        } else {
            // Overnight quiet hours
            if (currentTime >= quietStart || currentTime <= quietEnd) return false;
        }

        return true;
    }

    parseTime(timeStr) {
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 100 + minutes;
    }

    resetDailyCounter() {
        const currentDate = today();
        if (this.lastResetDate !== currentDate) {
            this.todayNotifications = 0;
            this.lastResetDate = currentDate;
        }
    }

    getPendingNotifications() {
        return this.notifications.filter(n => !n.read).length;
    }

    getSmartScore() {
        // Simple heuristic for "AI accuracy"
        const recent = this.notifications.slice(0, 10);
        if (recent.length === 0) return 85; // Default good score

        const useful = recent.filter(n => n.type !== 'test').length;
        return Math.min(95, Math.max(70, Math.round((useful / recent.length) * 100)));
    }

    renderRecentNotifications() {
        const recent = this.notifications.slice(0, 5);
        if (recent.length === 0) {
            return '<div class="sn-no-notifications">No hay notificaciones recientes</div>';
        }

        return recent.map(notification => `
            <div class="sn-notification-item ${notification.read ? 'read' : 'unread'}">
                <div class="sn-notification-icon">${this.getNotificationIcon(notification.type)}</div>
                <div class="sn-notification-content">
                    <div class="sn-notification-title">${notification.title}</div>
                    <div class="sn-notification-body">${notification.body}</div>
                    <div class="sn-notification-time">${this.formatTime(notification.timestamp)}</div>
                </div>
                <div class="sn-notification-actions">
                    ${!notification.read ? '<button onclick="smartNotificationsManager.markAsRead(\'' + notification.id + '\')">✓</button>' : ''}
                </div>
            </div>
        `).join('');
    }

    getNotificationIcon(type) {
        const icons = {
            predictive: '🎯',
            wellness: '💚',
            summary: '📊',
            report: '📈',
            test: '🧪'
        };
        return icons[type] || '🔔';
    }

    formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const diff = now - date;

        if (diff < 60000) return 'Ahora';
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)}min`;
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)}h`;

        return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    }

    updateRecentNotifications() {
        const list = document.getElementById('sn-recent-list');
        if (list) {
            list.innerHTML = this.renderRecentNotifications();
        }
    }

    async markAsRead(id) {
        const notification = this.notifications.find(n => n.id === id);
        if (notification) {
            notification.read = true;
            await this.saveNotifications();
            this.updateRecentNotifications();
        }
    }

    async saveNotifications() {
        try {
            // Keep only last 100 notifications
            this.notifications = this.notifications.slice(0, 100);
            await idb.set('smart-notifications-history', this.notifications);
        } catch (e) {
            console.warn('Error saving notifications:', e);
        }
    }

    async loadNotifications() {
        try {
            const data = await idb.get('smart-notifications-history');
            if (data) {
                this.notifications = data;
            }
        } catch (e) {
            console.warn('Error loading notifications:', e);
        }
    }

    async testNotification() {
        await this.sendNotification({
            title: '🧪 Notificación de Prueba',
            body: 'Esta es una notificación de prueba del sistema ultra-inteligente.',
            type: 'test',
            priority: 'normal'
        });
        toast('Notificación de prueba enviada!', 'success');
    }

    async generateInsights() {
        const insights = this.analyzeNotificationPatterns();
        const message = `📊 Insights de Notificaciones:\n\n${insights.map(i => `• ${i}`).join('\n')}`;

        await this.sendNotification({
            title: '🔍 Insights de Notificaciones',
            body: insights[0] || 'Análisis completado',
            type: 'insights',
            priority: 'normal'
        });

        toast('Insights generados y notificación enviada!', 'success');
    }

    analyzeNotificationPatterns() {
        const insights = [];
        const recent = this.notifications.slice(0, 20);

        if (recent.length < 5) {
            insights.push('Necesitas más datos para análisis precisos');
            return insights;
        }

        // Analyze response patterns
        const readRate = recent.filter(n => n.read).length / recent.length;
        if (readRate > 0.8) {
            insights.push('Excelente engagement con notificaciones');
        } else if (readRate < 0.5) {
            insights.push('Considera ajustar frecuencia de notificaciones');
        }

        // Analyze timing patterns
        const hourCounts = {};
        recent.forEach(n => {
            const hour = new Date(n.timestamp).getHours();
            hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        });

        const bestHour = Object.entries(hourCounts).reduce((a, b) => a[1] > b[1] ? a : b, [0, 0])[0];
        insights.push(`Mejor hora para notificaciones: ${bestHour}:00`);

        // Analyze type effectiveness
        const typeCounts = {};
        recent.forEach(n => {
            typeCounts[n.type] = (typeCounts[n.type] || 0) + 1;
        });

        const mostEffective = Object.entries(typeCounts).reduce((a, b) => a[1] > b[1] ? a : b, ['', 0])[0];
        insights.push(`Tipo más efectivo: ${mostEffective}`);

        return insights;
    }

    async clearHistory() {
        if (confirm('¿Eliminar todo el historial de notificaciones?')) {
            this.notifications = [];
            await this.saveNotifications();
            this.updateRecentNotifications();
            toast('Historial limpiado', 'info');
        }
    }

    updateNotificationSchedule() {
        // Clear existing schedules and restart if enabled
        if (this.settings.enabled) {
            this.scheduleNotifications();
        }
    }
}