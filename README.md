# Habby Chatbot — Documentación Global del Proyecto

Asistente inmobiliario para Habita Perú con arquitectura híbrida de IA, captura de leads y agendamiento de citas.

> **Estado actual (fase de prueba):** interfaz tipo **widget**.  
> **Visión final del producto:** experiencia conversacional **full-screen** (ventana completa), reemplazando la experiencia anterior de `https://habita.pe/habby/`.

---

## 1) Resumen ejecutivo

Este proyecto implementa un chatbot inmobiliario que:

- Consulta propiedades reales desde WordPress REST API.
- Responde consultas con LLM híbrido (Ollama como principal, Groq opcional como fallback).
- Registra leads en Supabase.
- Agenda citas con validación de cruces horarias.
- Envía confirmaciones por correo (si SMTP está configurado).

El backend está operativo y desplegable. La capa visual actual (widget) se usa para validación funcional y será reemplazada por frontend full-screen en la siguiente etapa.

---

## 2) Objetivo del proyecto

Construir un asistente comercial inmobiliario robusto, medible y escalable que convierta conversaciones en leads y citas agendadas, minimizando dependencia de un único proveedor de IA.

---

## 3) Alcance funcional actual

### Incluido en esta fase

- Chat con contexto inmobiliario.
- Integración con catálogo de inmuebles de WordPress.
- Captura de leads.
- Disponibilidad de horarios para agenda.
- Creación de citas con control de conflictos.
- Confirmación por email (opcional por configuración).
- Endpoint de salud para monitoreo.

### No incluido todavía (fase siguiente)

- Frontend full-screen definitivo con diseño de marca.
- Panel comercial integral (gestión avanzada de leads/citas).
- Automatizaciones avanzadas (recordatorios y flujos CRM).

---

## 4) Arquitectura (alto nivel)

### Capa de presentación

- `public/habby.js`: widget actual de prueba.
- `prueba.html`: panel simple para validar flujo de citas.

### Capa API

- Node.js + Express (`index.js` + rutas en `api/`).
- Endpoints desacoplados por dominio: chat, leads, citas, disponibilidad, propiedades.

### Capa de datos

- Supabase (PostgreSQL).
- Esquema en `supabase/schema.sql`.

### Capa de IA

- Primario: Ollama local (modelo Qwen).
- Fallback opcional: Groq.
- Safe-mode cuando no hay proveedor disponible.

---

## 5) Estructura del repositorio

- `index.js`: bootstrap del servidor.
- `api/chat.js`: flujo principal conversacional.
- `api/properties.js`: consulta y normalización de propiedades desde WordPress.
- `api/leads.js`: registro y validación de leads.
- `api/availability.js`: cálculo de slots disponibles.
- `api/appointments.js`: creación/listado de citas y validación de cruces.
- `api/llm.js`: orquestación de proveedor IA principal/fallback/safe-mode.
- `api/db.js`: conexión y utilidades de persistencia.
- `api/mailer.js`: envío de confirmaciones SMTP.
- `public/habby.js`: cliente de widget actual.
- `supabase/schema.sql`: tablas y constraints de base de datos.
- `vercel.json`: configuración de despliegue en Vercel.

---

## 6) Endpoints disponibles

### Chat

- `POST /api/chat` → responde mensaje del usuario.
- `GET /api/chat` → estado de proveedor IA.

### Datos inmobiliarios

- `GET /api/properties` → propiedades y metadata de caché.

### Leads

- `POST /api/leads` → crea lead.
- `GET /api/leads` → estado/configuración del módulo.

### Agenda y citas

- `GET /api/availability` → slots disponibles.
- `POST /api/appointments` → agenda cita validando conflictos.
- `GET /api/appointments` → estado/configuración.
- `GET /api/appointments?view=list&limit=50` → listado para panel.

### Operación

- `GET /api/health` → salud general del servicio.
- `GET /habby.js` → script de cliente actual.

---

## 7) Variables de entorno

El proyecto ya incluye:

- `.env` (local, no subir con secretos reales).
- `.env.example` (plantilla de referencia).

Variables clave:

- WordPress: `WP_URL`, `MAX_PROPERTIES`, `WHATSAPP_NUMBER`.
- LLM: `LLM_PRIMARY`, `OLLAMA_*`, `LLM_ENABLE_GROQ_FALLBACK`, `GROQ_*`.
- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`.
- Agenda: `SLOTS_DAYS_AHEAD`, `SLOT_MINUTES`, `WORK_*`, `LOCAL_TZ_OFFSET_MINUTES`.

> **Seguridad:** nunca expongas `SUPABASE_SERVICE_ROLE_KEY` ni credenciales SMTP en frontend.

---

## 8) Instalación y ejecución local

### Requisitos

- Node.js 18+
- npm
- (Opcional) Ollama local para operación híbrida real

### Pasos

1. Instalar dependencias: `npm install`
2. Revisar y completar `.env`
3. Levantar backend: `npm run dev`
4. Verificar salud: `GET /api/health`

### Scripts disponibles

- `npm run start`
- `npm run dev`
- `npm run smoke`
- `npm run chat:qa`

### QA de release (produccion)

Antes de cerrar una entrega, ejecutar:

1. `npm run chat:qa -- --base https://habby-chatbot.vercel.app`
2. `npm run smoke -- --base https://habby-chatbot.vercel.app`

Si ambos terminan en OK, la release queda validada funcional y conversacionalmente.

### QA automatizada en GitHub

Se incluye pipeline en `.github/workflows/vercel-production-qa.yml`:

1. Espera a que el endpoint de Vercel este disponible.
2. Ejecuta smoke test contra produccion.
3. Ejecuta regresion conversacional contra produccion.

Opcional:
- Definir variable de repositorio `HABBY_BASE_URL` para apuntar a otro dominio de despliegue.

---

## 9) Base de datos (Supabase)

1. Crear proyecto en Supabase.
2. Ejecutar `supabase/schema.sql` en SQL Editor.
3. Configurar en `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`

Tablas principales esperadas:

- `leads`
- `appointments`
- `email_logs`

---

## 10) Estrategia de despliegue por fases

### Fase actual (temporal)

- Vercel para validación funcional rápida.
- Recomendado en Vercel (si no hay Ollama local accesible):
  - `LLM_PRIMARY=groq`
  - `LLM_ENABLE_GROQ_FALLBACK=false`

### Fase objetivo (final)

- VPS con backend Node + Ollama local para operación híbrida completa.
- Perfil esperado:
  - `LLM_PRIMARY=ollama`
  - `OLLAMA_BASE_URL=http://127.0.0.1:11434`
  - `LLM_ENABLE_GROQ_FALLBACK=true`

### Despliegue en DirectAdmin (FastGlobalServer)

> **Recomendación de dominio:** crea un **subdominio en `habita.pe`** (ej. `chat.habita.pe`).
> Usa `habby.pe` **solo** si deseas mantener el dominio antiguo como legado.

#### Requisitos

- Tu plan debe **soportar Node.js** en DirectAdmin (aparece como *Node.js App* o *Application Manager*).
- Si **no** existe esa opción, mantén el API en Vercel y solo incrusta el script en WordPress.

#### Campos del formulario (DirectAdmin → Create Web Application)

- **Node.js version:** 18+ (recomendado 20+).
- **Application mode:** `production` (establece `NODE_ENV=production`).
- **Application root:** ruta física del proyecto (ej. `/home/usuario/domains/habita.pe/public_html/chat`).
- **Application URL:** URL pública del subdominio (ej. `https://chat.habita.pe`).
- **Application startup file:** `index.js`.
- **Environment variables:** agrega cada par `NOMBRE=VALOR`.
  - Si ves **“NO RESULT FOUND”**, es normal: crea la variable manualmente.

#### Variables mínimas recomendadas

- `WP_URL`, `MAX_PROPERTIES`, `WHATSAPP_NUMBER`
- `LLM_PRIMARY`, `OLLAMA_*` o `GROQ_*` según tu proveedor
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (si usarás leads/citas)
- `SMTP_*` (si usarás correos)

#### Script para WordPress (Habita.pe)

Coloca este script en el **footer** de WordPress:

```html
<script src="https://chat.habita.pe/habby.js" defer></script>
```

El widget ahora detecta automaticamente su `API_BASE` segun el dominio/ruta del script.
Ejemplos:

1. `https://chat.habita.pe/habby.js` -> usa `https://chat.habita.pe/api/...`
2. `https://habita.pe/habby/habby.js` -> usa `https://habita.pe/habby/api/...`

Si mantienes el API en Vercel, reemplaza el dominio por `https://habby-chatbot.vercel.app/habby.js`.

Opcional: puedes forzar otra API en WordPress antes del script:

```html
<script>window.HABBY_API_BASE='https://habby-chatbot.vercel.app/api';</script>
<script src="https://habita.pe/habby/habby.js" defer></script>
```

---

## 11) Roadmap de producto (importante)

### Situación actual

- El bot se presenta como widget para pruebas de flujo y estabilidad.

### Próximo hito

- Reemplazar el widget por frontend **full-screen** alineado a marca.
- Reutilizar el backend actual (chat, leads, citas y disponibilidad).
- Mantener compatibilidad de API para no romper integraciones existentes.

---

## 12) Pruebas recomendadas de aceptación

1. `POST /api/chat` responde con proveedor válido (`ollama`, `groq` o `safe-mode`).
2. `POST /api/leads` crea lead con ID.
3. `GET /api/availability` retorna slots.
4. `POST /api/appointments` crea cita sin conflicto.
5. `GET /api/appointments?view=list` lista citas para panel.
6. `GET /api/health` reporta servicio operativo.

---

## 13) Documentos complementarios

Para detalle de entrega y planificación:

- `README_ENTREGA_FINAL.md` → informe técnico formal de cierre de fase.
- `README_PLAN_DESARROLLO_2026.md` → cronograma diario completo (60 jornadas).

---

## 14) Estado global de madurez

- **Backend API:** operativo.
- **Integración de datos:** operativa (WordPress + Supabase).
- **Flujo comercial (lead → cita):** operativo.
- **UI final full-screen:** pendiente (siguiente fase).

Con esta base, el proyecto está listo para evolucionar de prototipo funcional (widget) a producto final de ventana completa, sin rehacer la lógica central del sistema.
