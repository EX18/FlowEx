// AIMentor.js - Asistente de IA para productividad
class AIMentor {
    constructor() {
        this.conversation = [];
        this.isTyping = false;
    }

    // Inicializar
    init() {
        this.renderAIInterface();
        this.loadConversation();
    }

    // Renderizar interfaz de IA
    renderAIInterface() {
        const container = document.getElementById('ai-chat-container');
        if (!container) return;

        container.innerHTML = `
            <div class="ai-header">
                <div class="ai-avatar">🤖</div>
                <div class="ai-info">
                    <h3>AI Mentor</h3>
                    <p>Asistente de productividad personal</p>
                </div>
                <div class="ai-status" id="ai-status">En línea</div>
            </div>

            <div class="ai-chat-messages" id="ai-messages">
                <div class="ai-message ai-message-bot">
                    <div class="ai-message-avatar">🤖</div>
                    <div class="ai-message-content">
                        ¡Hola! Soy tu asistente de productividad. Puedo ayudarte con:
                        <ul>
                            <li>💡 Sugerencias para mejorar tu productividad</li>
                            <li>📊 Análisis de tus hábitos y patrones</li>
                            <li>🎯 Recomendaciones personalizadas</li>
                            <li>❓ Respuestas a tus preguntas</li>
                        </ul>
                        ¿En qué puedo ayudarte hoy?
                    </div>
                </div>
            </div>

            <div class="ai-quick-actions">
                <button class="ai-quick-btn" onclick="aiMentor.quickAction('analyze')">📊 Analizar mi día</button>
                <button class="ai-quick-btn" onclick="aiMentor.quickAction('suggest')">💡 Sugerencias</button>
                <button class="ai-quick-btn" onclick="aiMentor.quickAction('motivate')">⚡ Motivación</button>
                <button class="ai-quick-btn" onclick="aiMentor.quickAction('plan')">📅 Planificar</button>
            </div>

            <div class="ai-input-container">
                <input type="text" id="ai-input" placeholder="Pregúntame algo..." class="ai-input">
                <button class="ai-send-btn" onclick="aiMentor.sendMessage()">📤</button>
            </div>
        `;

        // Event listeners
        const input = document.getElementById('ai-input');
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.sendMessage();
            }
        });
    }

    // Enviar mensaje
    async sendMessage() {
        const input = document.getElementById('ai-input');
        const message = input.value.trim();
        if (!message || this.isTyping) return;

        // Añadir mensaje del usuario
        this.addMessage('user', message);
        input.value = '';

        // Mostrar typing indicator
        this.showTyping();

        // Procesar mensaje
        const response = await this.processMessage(message);

        // Ocultar typing y mostrar respuesta
        this.hideTyping();
        this.addMessage('bot', response);

        // Guardar conversación
        this.saveConversation();
    }

    // Procesar mensaje y generar respuesta
    async processMessage(message) {
        const lowerMessage = message.toLowerCase();

        // Análisis de patrones comunes
        if (lowerMessage.includes('analiz') || lowerMessage.includes('cómo estoy')) {
            return await this.analyzeProductivity();
        }

        if (lowerMessage.includes('sugerenc') || lowerMessage.includes('mejorar')) {
            return await this.generateSuggestions();
        }

        if (lowerMessage.includes('motiv') || lowerMessage.includes('ánimo')) {
            return this.getMotivation();
        }

        if (lowerMessage.includes('plan') || lowerMessage.includes('organizar')) {
            return await this.generatePlan();
        }

        if (lowerMessage.includes('hábit') || lowerMessage.includes('rutina')) {
            return await this.analyzeHabits();
        }

        if (lowerMessage.includes('tarea') || lowerMessage.includes('pendiente')) {
            return await this.analyzeTasks();
        }

        if (lowerMessage.includes('tiempo') || lowerMessage.includes('horas')) {
            return await this.analyzeTime();
        }

        // Respuestas genéricas
        if (lowerMessage.includes('hola') || lowerMessage.includes('hi')) {
            return "¡Hola! ¿En qué puedo ayudarte con tu productividad hoy?";
        }

        if (lowerMessage.includes('gracias') || lowerMessage.includes('thanks')) {
            return "¡De nada! Estoy aquí para ayudarte a ser más productivo. ¿Algo más?";
        }

        // Respuesta por defecto
        return await this.generateGenericResponse(message);
    }

    // Análisis de productividad
    async analyzeProductivity() {
        const stats = this.getProductivityStats();

        let analysis = "📊 **Análisis de tu productividad:**\n\n";

        if (stats.tasksCompleted > 0) {
            analysis += `✅ Has completado ${stats.tasksCompleted} tareas esta semana\n`;
        }

        if (stats.habitsStreak > 0) {
            analysis += `🔥 Tienes ${stats.habitsStreak} días de racha en hábitos\n`;
        }

        if (stats.pomodoroSessions > 0) {
            analysis += `🍅 Has hecho ${stats.pomodoroSessions} sesiones de Pomodoro\n`;
        }

        if (stats.journalEntries > 0) {
            analysis += `📖 Has escrito ${stats.journalEntries} entradas en tu diario\n`;
        }

        // Recomendaciones basadas en stats
        analysis += "\n💡 **Recomendaciones:**\n";

        if (stats.tasksCompleted < 5) {
            analysis += "• Intenta completar al menos 5 tareas diarias\n";
        }

        if (stats.habitsStreak < 3) {
            analysis += "• Mantén consistencia en tus hábitos diarios\n";
        }

        if (stats.pomodoroSessions < 10) {
            analysis += "• Usa la técnica Pomodoro para mejor concentración\n";
        }

        return analysis;
    }

    // Generar sugerencias
    async generateSuggestions() {
        const suggestions = [
            "🎯 **Establece metas SMART:** Específicas, Medibles, Alcanzables, Relevantes, con Tiempo definido",
            "⏰ **Técnica de bloques de tiempo:** Dedica bloques específicos a tareas similares",
            "📝 **Regla 2 minutos:** Si una tarea toma menos de 2 minutos, hazla inmediatamente",
            "🌅 **Empieza el día con intención:** Planifica tus 3 tareas más importantes al despertar",
            "🚫 **Elimina distracciones:** Usa modo foco y apaga notificaciones durante trabajo intenso",
            "📊 **Revisa semanalmente:** Analiza qué funcionó y qué puedes mejorar",
            "💧 **Hidratación y pausas:** Toma agua regularmente y haz pausas activas cada hora",
            "😴 **Sueño primero:** Prioriza 7-8 horas de sueño para máxima productividad"
        ];

        return "💡 **Sugerencias para mejorar tu productividad:**\n\n" +
               suggestions.slice(0, 3).join('\n\n');
    }

    // Motivación
    getMotivation() {
        const quotes = [
            "⚡ 'La productividad es nunca terminar. Es estar siempre en movimiento.' - Thomas Edison",
            "🎯 'El éxito es la suma de pequeños esfuerzos repetidos día tras día.' - Robert Collier",
            "🚀 'No esperes a que llegue la motivación. Empieza y la motivación te seguirá.'",
            "💪 'La disciplina es elegir entre lo que quieres ahora y lo que quieres más tarde.'",
            "🌟 'Cada día es una nueva oportunidad para cambiar tu vida.'",
            "🔥 'La consistencia vence a la intensidad.' - James Clear",
            "🎯 'El progreso, no la perfección.'",
            "⚡ 'Haz lo que otros no quieren hacer, para tener lo que otros no pueden tener.'"
        ];

        return quotes[Math.floor(Math.random() * quotes.length)];
    }

    // Generar plan
    async generatePlan() {
        const now = new Date();
        const hour = now.getHours();

        let plan = "📅 **Plan sugerido para hoy:**\n\n";

        if (hour < 9) {
            plan += "🌅 **Mañana (6-9 AM):**\n";
            plan += "• Revisión de objetivos diarios\n";
            plan += "• Ejercicio matutino\n";
            plan += "• Planificación del día\n\n";
        }

        if (hour < 12) {
            plan += "☀️ **Mañana (9 AM-12 PM):**\n";
            plan += "• Trabajo profundo (bloque 1)\n";
            plan += "• Tareas importantes\n";
            plan += "• Reuniones/llamadas\n\n";
        }

        if (hour < 17) {
            plan += "🌤️ **Tarde (12-5 PM):**\n";
            plan += "• Trabajo profundo (bloque 2)\n";
            plan += "• Tareas administrativas\n";
            plan += "• Networking/colaboración\n\n";
        }

        plan += "🌆 **Tarde/Noche (5 PM+):**\n";
        plan += "• Revisión del día\n";
        plan += "• Tiempo personal/familia\n";
        plan += "• Preparación para mañana\n\n";

        plan += "💡 **Tips:**\n";
        plan += "• Usa técnica Pomodoro para concentración\n";
        plan += "• Toma pausas activas cada 90 minutos\n";
        plan += "• Revisa progreso cada 2 horas";

        return plan;
    }

    // Análisis de hábitos
    async analyzeHabits() {
        // Simular análisis de hábitos
        return "🔥 **Análisis de tus hábitos:**\n\n" +
               "Esta semana has mantenido:\n" +
               "• 5 hábitos diarios activos\n" +
               "• 85% de cumplimiento promedio\n" +
               "• Mejor hábito: 'Ejercicio' (95%)\n" +
               "• Hábito a mejorar: 'Lectura' (70%)\n\n" +
               "💡 **Sugerencia:** Establece recordatorios para hábitos difíciles";
    }

    // Análisis de tareas
    async analyzeTasks() {
        // Simular análisis de tareas
        return "✅ **Estado de tus tareas:**\n\n" +
               "• 12 tareas pendientes\n" +
               "• 8 completadas esta semana\n" +
               "• 3 tareas de alta prioridad\n" +
               "• Próxima fecha límite: Mañana\n\n" +
               "🎯 **Enfoque recomendado:** Completa las 3 tareas prioritarias primero";
    }

    // Análisis de tiempo
    async analyzeTime() {
        // Simular análisis de tiempo
        return "⏱️ **Análisis de tu tiempo:**\n\n" +
               "Esta semana has registrado:\n" +
               "• 28 horas de trabajo productivo\n" +
               "• 12 sesiones Pomodoro\n" +
               "• Promedio: 4 horas diarias\n" +
               "• Pico de productividad: 10 AM - 12 PM\n\n" +
               "📊 **Distribución:**\n" +
               "• Trabajo: 60%\n" +
               "• Reuniones: 20%\n" +
               "• Administración: 20%";
    }

    // Respuesta genérica
    async generateGenericResponse(message) {
        const responses = [
            "Interesante pregunta. Déjame analizar tu situación actual para darte una respuesta más personalizada.",
            "Para responder mejor, necesitaría más contexto sobre tus objetivos actuales. ¿Puedes darme más detalles?",
            "Esa es una buena pregunta sobre productividad. Basándome en las mejores prácticas, te recomiendo...",
            "Entiendo tu consulta. Déjame revisar tus datos actuales para darte una respuesta más precisa."
        ];

        return responses[Math.floor(Math.random() * responses.length)];
    }

    // Acciones rápidas
    quickAction(type) {
        let message = '';

        switch(type) {
            case 'analyze':
                message = 'Analiza mi productividad actual';
                break;
            case 'suggest':
                message = 'Dame sugerencias para mejorar';
                break;
            case 'motivate':
                message = 'Necesito motivación';
                break;
            case 'plan':
                message = 'Ayúdame a planificar mi día';
                break;
        }

        if (message) {
            document.getElementById('ai-input').value = message;
            this.sendMessage();
        }
    }

    // Añadir mensaje al chat
    addMessage(type, content) {
        const messagesContainer = document.getElementById('ai-messages');
        if (!messagesContainer) return;

        const messageDiv = document.createElement('div');
        messageDiv.className = `ai-message ai-message-${type}`;

        messageDiv.innerHTML = `
            <div class="ai-message-avatar">${type === 'bot' ? '🤖' : '👤'}</div>
            <div class="ai-message-content">${this.formatMessage(content)}</div>
        `;

        messagesContainer.appendChild(messageDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

        // Añadir a conversación
        this.conversation.push({
            type,
            content,
            timestamp: Date.now()
        });
    }

    // Formatear mensaje
    formatMessage(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n/g, '<br>')
            .replace(/•/g, '•');
    }

    // Mostrar indicador de escritura
    showTyping() {
        this.isTyping = true;
        const messagesContainer = document.getElementById('ai-messages');

        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-message ai-message-bot ai-typing';
        typingDiv.id = 'typing-indicator';
        typingDiv.innerHTML = `
            <div class="ai-message-avatar">🤖</div>
            <div class="ai-message-content">
                <div class="typing-dots">
                    <span></span>
                    <span></span>
                    <span></span>
                </div>
            </div>
        `;

        messagesContainer.appendChild(typingDiv);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }

    // Ocultar indicador de escritura
    hideTyping() {
        this.isTyping = false;
        const typingDiv = document.getElementById('typing-indicator');
        if (typingDiv) {
            typingDiv.remove();
        }
    }

    // Obtener estadísticas de productividad
    getProductivityStats() {
        // Simular estadísticas basadas en datos reales
        return {
            tasksCompleted: Math.floor(Math.random() * 20) + 5,
            habitsStreak: Math.floor(Math.random() * 10) + 1,
            pomodoroSessions: Math.floor(Math.random() * 30) + 5,
            journalEntries: Math.floor(Math.random() * 7) + 1
        };
    }

    // Guardar conversación
    saveConversation() {
        const data = {
            conversation: this.conversation.slice(-50), // Últimas 50 mensajes
            lastUpdated: Date.now()
        };
        localStorage.setItem('ai_conversation', JSON.stringify(data));
    }

    // Cargar conversación
    loadConversation() {
        try {
            const data = JSON.parse(localStorage.getItem('ai_conversation'));
            if (data && data.conversation) {
                this.conversation = data.conversation;
                // Renderizar mensajes previos
                this.conversation.forEach(msg => {
                    this.addMessage(msg.type, msg.content);
                });
            }
        } catch (e) {
            console.warn('Error loading AI conversation:', e);
        }
    }
}

// Instancia global
const aiMentor = new AIMentor();