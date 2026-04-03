// ProjectManager.js - Gestión de proyectos y milestones
class ProjectManager {
    constructor() {
        this.projects = [];
        this.currentProject = null;
    }

    // Inicializar desde storage
    async init() {
        const data = await idbGet('projects') || [];
        this.projects = data;
        this.renderProjects();
    }

    // Crear proyecto
    createProject(data) {
        const project = {
            id: uid(),
            name: data.name,
            description: data.description,
            color: data.color || '#7c6dfa',
            status: 'active', // active, completed, paused
            priority: data.priority || 'medium',
            startDate: data.startDate || today(),
            endDate: data.endDate,
            milestones: [],
            tasks: [], // IDs de tareas relacionadas
            progress: 0, // 0-100
            created: Date.now(),
            updated: Date.now()
        };
        this.projects.push(project);
        this.save();
        this.renderProjects();
        return project;
    }

    // Actualizar proyecto
    updateProject(id, updates) {
        const project = this.projects.find(p => p.id === id);
        if (project) {
            Object.assign(project, updates, { updated: Date.now() });
            this.save();
            this.renderProjects();
        }
    }

    // Eliminar proyecto
    deleteProject(id) {
        this.projects = this.projects.filter(p => p.id !== id);
        this.save();
        this.renderProjects();
    }

    // Añadir milestone
    addMilestone(projectId, data) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            const milestone = {
                id: uid(),
                name: data.name,
                description: data.description,
                dueDate: data.dueDate,
                status: 'pending', // pending, completed
                progress: 0,
                created: Date.now()
            };
            project.milestones.push(milestone);
            this.save();
            this.renderProjectDetails(projectId);
        }
    }

    // Actualizar milestone
    updateMilestone(projectId, milestoneId, updates) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            const milestone = project.milestones.find(m => m.id === milestoneId);
            if (milestone) {
                Object.assign(milestone, updates);
                this.save();
                this.renderProjectDetails(projectId);
            }
        }
    }

    // Calcular progreso del proyecto
    calculateProgress(project) {
        if (project.milestones.length === 0) return 0;
        const completed = project.milestones.filter(m => m.status === 'completed').length;
        return Math.round((completed / project.milestones.length) * 100);
    }

    // Guardar a storage
    async save() {
        await idbSet('projects', this.projects);
    }

    // Renderizar lista de proyectos
    renderProjects() {
        const container = document.getElementById('projects-list');
        if (!container) return;

        container.innerHTML = this.projects.map(project => `
            <div class="project-card" data-id="${project.id}" onclick="projectManager.selectProject('${project.id}')">
                <div class="project-header">
                    <div class="project-color" style="background: ${project.color}"></div>
                    <div class="project-info">
                        <h3>${project.name}</h3>
                        <span class="project-status status-${project.status}">${project.status}</span>
                    </div>
                    <div class="project-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${this.calculateProgress(project)}%"></div>
                        </div>
                        <span>${this.calculateProgress(project)}%</span>
                    </div>
                </div>
                <p class="project-desc">${project.description || 'Sin descripción'}</p>
                <div class="project-meta">
                    <span>${project.milestones.length} milestones</span>
                    <span>${project.tasks.length} tareas</span>
                </div>
            </div>
        `).join('');

        // Actualizar contador
        const countEl = document.getElementById('projects-count');
        if (countEl) countEl.textContent = this.projects.length;
    }

    // Seleccionar proyecto
    selectProject(id) {
        this.currentProject = this.projects.find(p => p.id === id);
        this.renderProjectDetails(id);
    }

    // Renderizar detalles del proyecto
    renderProjectDetails(id) {
        const project = this.projects.find(p => p.id === id);
        if (!project) return;

        const container = document.getElementById('project-details');
        if (!container) return;

        container.innerHTML = `
            <div class="project-detail-header">
                <div class="project-title">
                    <div class="project-color-large" style="background: ${project.color}"></div>
                    <div>
                        <h2>${project.name}</h2>
                        <p>${project.description || 'Sin descripción'}</p>
                    </div>
                </div>
                <div class="project-actions">
                    <button class="btn-secondary" onclick="projectManager.editProject('${project.id}')">Editar</button>
                    <button class="btn-danger" onclick="projectManager.deleteProject('${project.id}')">Eliminar</button>
                </div>
            </div>

            <div class="project-stats">
                <div class="stat-item">
                    <span class="stat-label">Progreso</span>
                    <span class="stat-value">${this.calculateProgress(project)}%</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Milestones</span>
                    <span class="stat-value">${project.milestones.length}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Tareas</span>
                    <span class="stat-value">${project.tasks.length}</span>
                </div>
                <div class="stat-item">
                    <span class="stat-label">Estado</span>
                    <span class="stat-value status-${project.status}">${project.status}</span>
                </div>
            </div>

            <div class="project-milestones">
                <h3>Milestones</h3>
                <div class="milestones-list">
                    ${project.milestones.map(milestone => `
                        <div class="milestone-item ${milestone.status}">
                            <div class="milestone-check">
                                <input type="checkbox" 
                                       ${milestone.status === 'completed' ? 'checked' : ''} 
                                       onchange="projectManager.toggleMilestone('${project.id}', '${milestone.id}')">
                            </div>
                            <div class="milestone-info">
                                <h4>${milestone.name}</h4>
                                <p>${milestone.description || ''}</p>
                                ${milestone.dueDate ? `<span class="due-date">Vence: ${dateLabel(milestone.dueDate)}</span>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="btn-primary" onclick="projectManager.showAddMilestone('${project.id}')">+ Añadir Milestone</button>
            </div>
        `;

        // Mostrar sección de detalles
        document.getElementById('projects-overview').style.display = 'none';
        document.getElementById('project-details').style.display = 'block';
    }

    // Toggle milestone
    toggleMilestone(projectId, milestoneId) {
        const project = this.projects.find(p => p.id === projectId);
        if (project) {
            const milestone = project.milestones.find(m => m.id === milestoneId);
            if (milestone) {
                milestone.status = milestone.status === 'completed' ? 'pending' : 'completed';
                this.save();
                this.renderProjectDetails(projectId);
            }
        }
    }

    // Mostrar formulario para añadir milestone
    showAddMilestone(projectId) {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Añadir Milestone</h3>
                <form onsubmit="projectManager.addMilestoneForm(event, '${projectId}')">
                    <input type="text" name="name" placeholder="Nombre del milestone" required>
                    <textarea name="description" placeholder="Descripción"></textarea>
                    <input type="date" name="dueDate">
                    <div class="modal-actions">
                        <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button type="submit" class="btn-primary">Añadir</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Manejar formulario de milestone
    addMilestoneForm(event, projectId) {
        event.preventDefault();
        const formData = new FormData(event.target);
        this.addMilestone(projectId, {
            name: formData.get('name'),
            description: formData.get('description'),
            dueDate: formData.get('dueDate')
        });
        event.target.closest('.modal-overlay').remove();
    }

    // Mostrar formulario para crear proyecto
    showCreateProject() {
        const modal = document.createElement('div');
        modal.className = 'modal-overlay';
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Crear Proyecto</h3>
                <form onsubmit="projectManager.createProjectForm(event)">
                    <input type="text" name="name" placeholder="Nombre del proyecto" required>
                    <textarea name="description" placeholder="Descripción"></textarea>
                    <div class="form-row">
                        <select name="priority">
                            <option value="low">Baja</option>
                            <option value="medium" selected>Media</option>
                            <option value="high">Alta</option>
                        </select>
                        <input type="color" name="color" value="#7c6dfa">
                    </div>
                    <div class="form-row">
                        <input type="date" name="startDate" value="${today()}">
                        <input type="date" name="endDate">
                    </div>
                    <div class="modal-actions">
                        <button type="button" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                        <button type="submit" class="btn-primary">Crear</button>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);
    }

    // Manejar formulario de creación
    createProjectForm(event) {
        event.preventDefault();
        const formData = new FormData(event.target);
        this.createProject({
            name: formData.get('name'),
            description: formData.get('description'),
            priority: formData.get('priority'),
            color: formData.get('color'),
            startDate: formData.get('startDate'),
            endDate: formData.get('endDate')
        });
        event.target.closest('.modal-overlay').remove();
    }

    // Volver a la lista
    backToProjects() {
        document.getElementById('projects-overview').style.display = 'block';
        document.getElementById('project-details').style.display = 'none';
        this.currentProject = null;
    }
}

// Instancia global
const projectManager = new ProjectManager();