# ⚡ FlowEX — Productividad sin fricción

> Gestor de tareas, hábitos y calendario todo en uno con IA integrada. PWA instalable en celular.

![FlowEX](https://img.shields.io/badge/PWA-Instalable-7c6dfa?style=flat-square) ![Version](https://img.shields.io/badge/version-1.0.0-fa6d8f?style=flat-square) ![License](https://img.shields.io/badge/license-MIT-6dfac4?style=flat-square)

---

## 📱 Instalación en celular

### Android (Chrome)
1. Abrí el link en Chrome
2. Tocá el ícono de menú (⋮)
3. Seleccioná **"Agregar a pantalla de inicio"**
4. ¡Listo! FlowEX aparece como app nativa

### iPhone (Safari)
1. Abrí el link en Safari
2. Tocá el botón de compartir (□↑)
3. Seleccioná **"Agregar a pantalla de inicio"**
4. ¡Listo! FlowEX aparece como app nativa

---

## ✨ Características

### 📋 Tareas
- Crear tareas con prioridad (alta/media/baja), categoría, fecha límite y tiempo estimado
- Filtrar por categoría, estado o fecha
- Marcar como completada con un tap
- Añadir notas a cada tarea

### 🔥 Hábitos
- Rastrear hábitos diarios con vista semanal
- Racha automática (streak counter)
- Barra de progreso semanal por hábito
- Soporte para hábitos diarios / días de semana / fines de semana

### 📅 Calendario
- Vista mensual con puntos en días con tareas
- Tap en cualquier día para ver sus tareas
- Navegación entre meses

### 🤖 IA Integrada
- Asistente conversacional con Claude (Anthropic)
- Sugerencias personalizadas de productividad
- Respuestas rápidas predefinidas
- Fallback a respuestas demo sin conexión

### ⚙️ Ajustes
- 5 temas de color (Morado, Verde, Rosa, Cyan, Naranja)
- Editar nombre de usuario
- Exportar/importar datos en JSON
- Soporte para notificaciones nativas

---

## 🚀 Onboarding

Al abrir por primera vez, el usuario pasa por un flujo de 9 pantallas:
1. Bienvenida
2. Feature: Tareas
3. Feature: Hábitos
4. Feature: Calendario
5. Feature: IA
6. Ingresar nombre
7. Elegir tema de color
8. Elegir modo de uso
9. Pantalla de inicio

---

## 💾 Persistencia de datos

Todo se guarda en **localStorage** del navegador:
- `fx_user` — preferencias y perfil
- `fx_tareas` — lista de tareas
- `fx_habitos` — hábitos y rachas

Los datos persisten entre sesiones y se pueden exportar/importar como JSON.

---

## 🗂 Estructura del proyecto

```
flowex/
├── index.html        ← App completa (SPA)
├── manifest.json     ← PWA manifest
├── sw.js             ← Service Worker (offline)
├── icons/            ← Íconos para iOS/Android
│   ├── icon-72.png
│   ├── icon-96.png
│   ├── icon-128.png
│   ├── icon-144.png
│   ├── icon-152.png
│   ├── icon-192.png
│   ├── icon-384.png
│   └── icon-512.png
└── README.md
```

---

## 🎨 Stack técnico

- **Vanilla JS** — Sin dependencias ni frameworks
- **CSS Variables** — Sistema de temas dinámico
- **localStorage** — Persistencia de datos
- **Service Worker** — Soporte offline y caché
- **Web App Manifest** — Instalación como PWA
- **Anthropic Claude API** — Asistente IA (opcional)

---

## 🌐 Deploy en GitHub Pages

1. Hacé fork de este repo
2. Ve a **Settings → Pages**
3. Seleccioná `main` branch, carpeta `/`
4. Tu app estará en `https://tu-usuario.github.io/flowex`

---

## 🔧 Configuración de la IA

El asistente IA funciona en modo demo por defecto. Para conectar con Claude:

La API key se maneja del lado del servidor — no incluyas API keys en el frontend. Podés deployar un proxy simple con Cloudflare Workers o Vercel Edge Functions.

---

## 📄 Licencia

MIT © 2025 — Hecho con ⚡ y mucho café
