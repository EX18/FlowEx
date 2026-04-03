class TodoListManager {
    constructor() {
        this.lists = [];
        this.currentListId = null;
        this.todos = [];
        this.settings = {
            defaultList: null,
            sortBy: 'priority',
            showCompleted: false,
            autoArchiveCompleted: true,
            archiveAfterDays: 7
        };
    }

    async init() {
        await this.loadData();
        this.initializeDefaultLists();
        this.render();
        this.attachEventListeners();
    }

    async loadData() {
        try {
            const lists = await idb.get('todo-lists');
            const todos = await idb.get('todo-todos');
            const settings = await idb.get('todo-settings');

            if (lists) this.lists = lists;
            if (todos) this.todos = todos;
            if (settings) this.settings = { ...this.settings, ...settings };

            if (this.lists.length > 0) {
                this.currentListId = this.settings.defaultList || this.lists[0].id;
            }
        } catch (e) {
            console.warn('Error loading todo data:', e);
        }
    }

    async saveData() {
        try {
            await idb.set('todo-lists', this.lists);
            await idb.set('todo-todos', this.todos);
            await idb.set('todo-settings', this.settings);
        } catch (e) {
            console.warn('Error saving todo data:', e);
        }
    }

    initializeDefaultLists() {
        if (this.lists.length > 0) return;

        this.lists = [
            {
                id: uid(),
                name: '📌 Importante',
                icon: '📌',
                color: 'var(--a)',
                description: 'Tareas prioritarias del momento',
                createdAt: new Date().toISOString(),
                order: 1
            },
            {
                id: uid(),
                name: '📋 Mi Día',
                icon: '📋',
                color: 'var(--a2)',
                description: 'Tareas para hoy',
                createdAt: new Date().toISOString(),
                order: 2
            },
            {
                id: uid(),
                name: '🎯 Proyecto',
                icon: '🎯',
                color: 'var(--a3)',
                description: 'Tareas del proyecto actual',
                createdAt: new Date().toISOString(),
                order: 3
            },
            {
                id: uid(),
                name: '✅ Completadas',
                icon: '✅',
                color: 'var(--success)',
                description: 'Tareas ya completadas',
                createdAt: new Date().toISOString(),
                order: 4,
                isCompleted: true
            }
        ];

        this.currentListId = this.lists[0].id;
        this.settings.defaultList = this.lists[0].id;
    }

    render() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="todo-container">
                <div class="todo-header">
                    <div class="todo-title">📝 Mi Todo List</div>
                    <div class="todo-subtitle">Organiza y completa tus tareas de forma eficiente</div>
                </div>

                <div class="todo-main">
                    <div class="todo-sidebar">
                        ${this.renderListsSidebar()}
                    </div>

                    <div class="todo-content">
                        ${this.renderTodoContent()}
                    </div>
                </div>

                <div class="todo-stats">
                    ${this.renderStats()}
                </div>
            </div>
        `;

        this.attachEventListeners();
    }

    renderListsSidebar() {
        return `
            <div class="todo-lists">
                <div class="todo-lists-header">
                    <div class="todo-lists-title">Mis Listas</div>
                    <button class="todo-new-list-btn" onclick="todoListManager.showNewListModal()">+</button>
                </div>

                <div class="todo-lists-items">
                    ${this.lists.map(list => `
                        <button class="todo-list-item ${this.currentListId === list.id ? 'active' : ''}" onclick="todoListManager.switchList('${list.id}')">
                            <div class="todo-list-icon">${list.icon}</div>
                            <div class="todo-list-info">
                                <div class="todo-list-name">${list.name}</div>
                                <div class="todo-list-count">${this.getTodoCountForList(list.id)}</div>
                            </div>
                            <div class="todo-list-menu" onclick="event.stopPropagation(); todoListManager.showListMenu('${list.id}')">⋮</div>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }

    renderTodoContent() {
        const currentList = this.lists.find(l => l.id === this.currentListId);
        if (!currentList) return '';

        const listTodos = this.getTodosForList(this.currentListId);
        const incompleteTodos = listTodos.filter(t => !t.completed);
        const completedTodos = listTodos.filter(t => t.completed);

        return `
            <div class="todo-content-inner">
                <div class="todo-list-header">
                    <div class="todo-list-title-large">
                        <span style="font-size: 24px; margin-right: 8px;">${currentList.icon}</span>
                        ${currentList.name}
                    </div>
                    <div class="todo-list-description">${currentList.description}</div>
                </div>

                <div class="todo-input-area">
                    <input type="text" id="todo-quick-input" class="todo-quick-input" placeholder="Agregar nueva tarea..." onkeypress="if(event.key==='Enter') todoListManager.quickAddTodo()">
                    <button class="todo-quick-add" onclick="todoListManager.quickAddTodo()">Agregar</button>
                </div>

                <div class="todo-filters">
                    <button class="todo-filter-btn ${!this.settings.showCompleted ? 'active' : ''}" onclick="todoListManager.toggleShowCompleted()">
                        📋 Pendientes (${incompleteTodos.length})
                    </button>
                    <button class="todo-filter-btn ${this.settings.showCompleted ? 'active' : ''}" onclick="todoListManager.toggleShowCompleted()">
                        ✅ Completadas (${completedTodos.length})
                    </button>
                </div>

                <div class="todo-items">
                    ${this.renderTodoItems(incompleteTodos, completedTodos)}
                </div>
            </div>
        `;
    }

    renderTodoItems(incompleteTodos, completedTodos) {
        if (incompleteTodos.length === 0 && !this.settings.showCompleted) {
            return `
                <div class="todo-empty">
                    <div class="todo-empty-icon">🎉</div>
                    <div class="todo-empty-title">¡Todo completado!</div>
                    <div class="todo-empty-text">No hay tareas pendientes. ¡Buen trabajo!</div>
                </div>
            `;
        }

        let html = '';

        // Pending todos
        if (incompleteTodos.length > 0) {
            html += `
                <div class="todo-section">
                    <div class="todo-section-title">Por Hacer</div>
                    <div class="todo-list-items">
                        ${incompleteTodos.sort((a, b) => {
                            if (this.settings.sortBy === 'priority') {
                                const priorityOrder = { high: 0, medium: 1, low: 2 };
                                return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
                            }
                            return new Date(b.createdAt) - new Date(a.createdAt);
                        }).map(todo => this.renderTodoItem(todo)).join('')}
                    </div>
                </div>
            `;
        }

        // Completed todos
        if (this.settings.showCompleted && completedTodos.length > 0) {
            html += `
                <div class="todo-section completed-section">
                    <div class="todo-section-title">Completadas</div>
                    <div class="todo-list-items">
                        ${completedTodos.map(todo => this.renderTodoItem(todo)).join('')}
                    </div>
                </div>
            `;
        }

        return html;
    }

    renderTodoItem(todo) {
        const priorityColors = {
            high: 'var(--error)',
            medium: 'var(--warning)',
            low: 'var(--info)'
        };

        const daysLeft = todo.dueDate ? Math.ceil((new Date(todo.dueDate) - new Date()) / 86400000) : null;
        const isOverdue = daysLeft !== null && daysLeft < 0;
        const isDueSoon = daysLeft !== null && daysLeft <= 2 && daysLeft >= 0;

        return `
            <div class="todo-item ${todo.completed ? 'completed' : ''} ${isOverdue ? 'overdue' : ''} ${isDueSoon ? 'due-soon' : ''}">
                <div class="todo-item-checkbox">
                    <input type="checkbox" ${todo.completed ? 'checked' : ''} onchange="todoListManager.toggleTodo('${todo.id}')">
                </div>

                <div class="todo-item-content">
                    <div class="todo-item-title">${todo.title}</div>
                    ${todo.description ? `<div class="todo-item-description">${todo.description}</div>` : ''}
                    
                    <div class="todo-item-meta">
                        ${todo.priority ? `
                            <span class="todo-priority" style="background-color: ${priorityColors[todo.priority]}">
                                ${this.getPriorityLabel(todo.priority)}
                            </span>
                        ` : ''}
                        ${todo.dueDate ? `
                            <span class="todo-due-date ${isOverdue ? 'overdue' : isDueSoon ? 'due-soon' : ''}">
                                📅 ${this.formatDueDate(todo.dueDate)}
                            </span>
                        ` : ''}
                        ${todo.tags && todo.tags.length > 0 ? `
                            <div class="todo-tags">
                                ${todo.tags.map(tag => `<span class="todo-tag">#${tag}</span>`).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>

                <div class="todo-item-actions">
                    <button class="todo-action-btn" onclick="todoListManager.editTodo('${todo.id}')" title="Editar">✏️</button>
                    <button class="todo-action-btn delete" onclick="todoListManager.deleteTodo('${todo.id}')" title="Eliminar">🗑️</button>
                </div>
            </div>
        `;
    }

    renderStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(t => t.completed).length;
        const pending = total - completed;
        const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

        const listCounts = {};
        this.lists.forEach(list => {
            listCounts[list.id] = this.getTodoCountForList(list.id);
        });

        const mostBusyList = Object.entries(listCounts).reduce((a, b) => a[1] > b[1] ? a : b, ['', 0])[0];
        const mostBusyListName = this.lists.find(l => l.id === mostBusyList)?.name || 'N/A';

        return `
            <div class="todo-stats-container">
                <div class="todo-stat-card">
                    <div class="todo-stat-icon">📊</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Total</div>
                        <div class="todo-stat-value">${total}</div>
                    </div>
                </div>

                <div class="todo-stat-card">
                    <div class="todo-stat-icon">⏳</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Pendientes</div>
                        <div class="todo-stat-value">${pending}</div>
                    </div>
                </div>

                <div class="todo-stat-card">
                    <div class="todo-stat-icon">✅</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Completadas</div>
                        <div class="todo-stat-value">${completed}</div>
                    </div>
                </div>

                <div class="todo-stat-card">
                    <div class="todo-stat-icon">📈</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Progreso</div>
                        <div class="todo-stat-value">${completionRate}%</div>
                    </div>
                </div>

                <div class="todo-stat-card">
                    <div class="todo-stat-icon">🔥</div>
                    <div class="todo-stat-content">
                        <div class="todo-stat-label">Más Ocupada</div>
                        <div class="todo-stat-value-small">${mostBusyListName}</div>
                    </div>
                </div>
            </div>
        `;
    }

    switchList(listId) {
        this.currentListId = listId;
        this.settings.defaultList = listId;
        this.saveData();
        this.render();
    }

    getTodoCountForList(listId) {
        return this.todos.filter(t => t.listId === listId && !t.completed).length;
    }

    getTodosForList(listId) {
        return this.todos.filter(t => t.listId === listId);
    }

    async quickAddTodo() {
        const input = document.getElementById('todo-quick-input');
        if (!input) return;

        const title = input.value.trim();
        if (!title) return;

        const todo = {
            id: uid(),
            listId: this.currentListId,
            title,
            description: '',
            priority: 'medium',
            completed: false,
            dueDate: null,
            tags: [],
            createdAt: new Date().toISOString(),
            completedAt: null
        };

        this.todos.unshift(todo);
        await this.saveData();

        input.value = '';
        input.focus();
        this.render();

        toast('✅ Tarea agregada', 'success');
    }

    async toggleTodo(todoId) {
        const todo = this.todos.find(t => t.id === todoId);
        if (todo) {
            todo.completed = !todo.completed;
            todo.completedAt = todo.completed ? new Date().toISOString() : null;
            await this.saveData();
            this.render();

            if (todo.completed) {
                confetti();
                toast('🎉 ¡Tarea completada!', 'success');
            }
        }
    }

    async deleteTodo(todoId) {
        if (!confirm('¿Eliminar esta tarea?')) return;

        this.todos = this.todos.filter(t => t.id !== todoId);
        await this.saveData();
        this.render();
        toast('🗑️ Tarea eliminada', 'info');
    }

    editTodo(todoId) {
        const todo = this.todos.find(t => t.id === todoId);
        if (!todo) return;

        this.showEditTodoModal(todo);
    }

    showNewListModal() {
        const modal = `
            <div class="todo-modal-overlay" onclick="todoListManager.hideModal()">
                <div class="todo-modal" onclick="event.stopPropagation()">
                    <div class="todo-modal-header">
                        <div class="todo-modal-title">Crear Nueva Lista</div>
                        <button class="todo-modal-close" onclick="todoListManager.hideModal()">✕</button>
                    </div>
                    <div class="todo-modal-body">
                        <div class="todo-form-group">
                            <label>Nombre de la lista</label>
                            <input type="text" id="list-name" placeholder="Ej: Mi Proyecto">
                        </div>
                        <div class="todo-form-group">
                            <label>Ícono</label>
                            <input type="text" id="list-icon" placeholder="Ej: 🎯" value="📋" maxlength="2">
                        </div>
                        <div class="todo-form-group">
                            <label>Descripción</label>
                            <textarea id="list-description" placeholder="Describe el propósito de esta lista..." rows="2"></textarea>
                        </div>
                    </div>
                    <div class="todo-modal-footer">
                        <button class="todo-btn-secondary" onclick="todoListManager.hideModal()">Cancelar</button>
                        <button class="todo-btn-primary" onclick="todoListManager.createList()">Crear</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modal);
    }

    showEditTodoModal(todo) {
        const modal = `
            <div class="todo-modal-overlay" onclick="todoListManager.hideModal()">
                <div class="todo-modal" onclick="event.stopPropagation()">
                    <div class="todo-modal-header">
                        <div class="todo-modal-title">Editar Tarea</div>
                        <button class="todo-modal-close" onclick="todoListManager.hideModal()">✕</button>
                    </div>
                    <div class="todo-modal-body">
                        <div class="todo-form-group">
                            <label>Título</label>
                            <input type="text" id="todo-title" value="${todo.title}">
                        </div>
                        <div class="todo-form-group">
                            <label>Descripción</label>
                            <textarea id="todo-description" rows="2">${todo.description || ''}</textarea>
                        </div>
                        <div class="todo-form-row">
                            <div class="todo-form-group">
                                <label>Prioridad</label>
                                <select id="todo-priority">
                                    <option value="low" ${todo.priority === 'low' ? 'selected' : ''}>Baja</option>
                                    <option value="medium" ${todo.priority === 'medium' ? 'selected' : ''}>Media</option>
                                    <option value="high" ${todo.priority === 'high' ? 'selected' : ''}>Alta</option>
                                </select>
                            </div>
                            <div class="todo-form-group">
                                <label>Fecha Límite</label>
                                <input type="date" id="todo-due-date" value="${todo.dueDate ? todo.dueDate.split('T')[0] : ''}">
                            </div>
                        </div>
                        <div class="todo-form-group">
                            <label>Etiquetas (separadas por coma)</label>
                            <input type="text" id="todo-tags" placeholder="trabajo, urgente, importante" value="${todo.tags ? todo.tags.join(', ') : ''}">
                        </div>
                    </div>
                    <div class="todo-modal-footer">
                        <button class="todo-btn-secondary" onclick="todoListManager.hideModal()">Cancelar</button>
                        <button class="todo-btn-primary" onclick="todoListManager.updateTodo('${todo.id}')">Guardar Cambios</button>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modal);
    }

    async createList() {
        const name = document.getElementById('list-name').value.trim();
        const icon = document.getElementById('list-icon').value.trim() || '📋';
        const description = document.getElementById('list-description').value.trim();

        if (!name) {
            toast('Por favor ingresa un nombre para la lista', 'error');
            return;
        }

        const newList = {
            id: uid(),
            name: `${icon} ${name}`,
            icon,
            color: this.getRandomColor(),
            description,
            createdAt: new Date().toISOString(),
            order: this.lists.length + 1
        };

        this.lists.push(newList);
        await this.saveData();
        this.hideModal();
        this.render();

        toast('✅ Lista creada', 'success');
    }

    async updateTodo(todoId) {
        const todo = this.todos.find(t => t.id === todoId);
        if (!todo) return;

        todo.title = document.getElementById('todo-title').value.trim();
        todo.description = document.getElementById('todo-description').value.trim();
        todo.priority = document.getElementById('todo-priority').value;
        todo.dueDate = document.getElementById('todo-due-date').value || null;
        todo.tags = document.getElementById('todo-tags').value
            .split(',')
            .map(tag => tag.trim())
            .filter(tag => tag.length > 0);

        await this.saveData();
        this.hideModal();
        this.render();

        toast('✅ Tarea actualizada', 'success');
    }

    showListMenu(listId) {
        // Could implement list menu (edit, delete, etc.)
        alert('Opciones de lista - Próximamente más funciones');
    }

    toggleShowCompleted() {
        this.settings.showCompleted = !this.settings.showCompleted;
        this.saveData();
        this.render();
    }

    hideModal() {
        const modal = document.querySelector('.todo-modal-overlay');
        if (modal) modal.remove();
    }

    getPriorityLabel(priority) {
        const labels = {
            high: '🔴 Alta',
            medium: '🟡 Media',
            low: '🟢 Baja'
        };
        return labels[priority] || priority;
    }

    formatDueDate(dateStr) {
        const date = new Date(dateStr);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.toDateString() === today.toDateString()) {
            return 'Hoy';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Mañana';
        }

        return date.toLocaleDateString('es-ES', { month: 'short', day: 'numeric' });
    }

    getRandomColor() {
        const colors = [
            'var(--a)',
            'var(--a2)',
            'var(--a3)',
            'var(--warning)',
            'var(--success)',
            'var(--info)'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    attachEventListeners() {
        // Event listeners are handled via onclick in the HTML
    }

    // Quick access functions for dashboard widget
    getQuickStats() {
        const total = this.todos.length;
        const completed = this.todos.filter(t => t.completed).length;
        const pending = total - completed;

        return {
            total,
            completed,
            pending,
            completionRate: total > 0 ? Math.round((completed / total) * 100) : 0
        };
    }

    getQuickTodos(limit = 5) {
        return this.todos
            .filter(t => !t.completed)
            .sort((a, b) => {
                const priorityOrder = { high: 0, medium: 1, low: 2 };
                return (priorityOrder[a.priority] || 2) - (priorityOrder[b.priority] || 2);
            })
            .slice(0, limit);
    }
}