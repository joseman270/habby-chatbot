# Habby Chatbot - Informe Final de Desarrollo

## 0. Informe Final (Estado del Proyecto)

Estado: backend operativo para chat inmobiliario, captura de leads y agendamiento de citas.

Componentes finalizados en esta fase:
- Integracion con WordPress REST API para propiedades.
- Motor IA hibrido (Qwen en Ollama como primario, fallback opcional).
- Modo seguro para continuidad del servicio.
- Persistencia de leads y citas con Supabase.
- Confirmacion de cita para pantalla y envio por email (si SMTP esta configurado).

Pendiente de siguiente fase:
- Frontend full-screen (sin icono flotante).
- Slots automaticos de agenda y recordatorios programados.
- Panel de gestion comercial (leads/citas).

## 1. Resumen Ejecutivo

Habby Chatbot es un asistente inmobiliario para Habita Peru que conecta clientes con propiedades publicadas en WordPress y responde consultas en lenguaje natural.

La arquitectura elegida es hibrida y prioriza continuidad operativa:
- Motor principal local con Ollama + Qwen.
- Fallback opcional a Groq (apagado por defecto).
- Modo seguro cuando no hay disponibilidad de IA.
- Cache de propiedades para resistir caidas puntuales de WordPress.

Objetivo principal: minimizar riesgo de caidas y dependencia de creditos por API externa, manteniendo experiencia estable para clientes.

## 2. Problema de Negocio

Antes del enfoque actual, un chatbot dependiente de un solo proveedor de IA enfrentaba riesgos:
- Interrupcion por agotamiento de creditos.
- Fallos por latencia o indisponibilidad del proveedor.
- Poca previsibilidad de costos por consumo.
- Mala experiencia cuando WordPress o el proveedor de IA no responden.

## 3. Objetivos del Proyecto

- Ofrecer asistencia inmobiliaria 24/7.
- Responder usando data real del portal inmobiliario.
- Mantener alta disponibilidad en condiciones reales de VPS.
- Controlar costos operativos mensuales.
- Permitir crecimiento por fases sin reescribir el sistema.

## 4. Alcance Funcional Actual

- Consulta de propiedades publicadas.
- Respuestas guiadas sobre compra, venta y alquiler.
- Derivacion a asesor humano por WhatsApp.
- Endpoint de salud para monitoreo operativo.
- Degradacion controlada (safe-mode) ante fallos.

## 5. Arquitectura Tecnica

Componentes principales:
- Frontend web (integracion actual por script).
- Backend Node.js/Express.
- Fuente de datos inmobiliaria desde WordPress REST API.
- LLM principal local via Ollama (Qwen).
- Cache en memoria de propiedades.

Flujo de atencion:
1. Usuario envia mensaje.
2. Backend obtiene contexto de propiedades (cache o WP).
3. Se intenta responder con Ollama (Qwen).
4. Si esta activado, se intenta fallback a Groq.
5. Si no hay proveedor disponible, responde safe-mode con alternativas y contacto asesor.

## 6. Justificacion de Tecnologias

### Node.js + Express
- Rapido de implementar y mantener.
- Buen rendimiento para APIs de chat.
- Amplio soporte en VPS y hosting tradicional.

### Ollama + Qwen (local)
- Sin costo por token ni creditos por request.
- Mayor control de disponibilidad.
- Permite operar en infraestructura propia (DirectAdmin + VPS).

### WordPress REST API
- Reutiliza la fuente oficial ya existente del negocio.
- Evita doble carga operativa de publicar en dos sistemas.

### Cache en memoria
- Reduce latencia de respuesta.
- Permite continuidad temporal cuando WordPress falla.

## 7. Beneficios Esperados

- Mayor disponibilidad del servicio de chat.
- Menor riesgo financiero por consumo variable de API.
- Mejor experiencia del usuario final.
- Respuestas alineadas al inventario real.
- Base solida para escalar a analitica, CRM y automatizaciones.

## 8. Pros y Contras de la Solucion

### Pros
- Menor dependencia de terceros para IA.
- Costos mas predecibles.
- Mejor resiliencia con fallback y safe-mode.
- Arquitectura extensible por fases.

### Contras
- Mayor responsabilidad operativa en el VPS.
- Requiere monitoreo de recursos (CPU/RAM).
- La calidad de respuesta depende del modelo y tuning local.

## 9. Riesgos y Mitigaciones

- Riesgo: saturacion del VPS.
	Mitigacion: timeouts, circuit breaker, modelos ligeros y monitoreo.

- Riesgo: caida de WordPress.
	Mitigacion: cache stale y respuesta de contingencia.

- Riesgo: caida del motor IA.
	Mitigacion: fallback opcional + safe-mode + contacto humano.

- Riesgo: crecimiento de trafico.
	Mitigacion: separar servicios por capas y agregar cache distribuido.

## 10. Escalabilidad

Escalabilidad vertical (corto plazo):
- Aumentar RAM/CPU del VPS.
- Ajustar modelo y concurrencia de Ollama.

Escalabilidad horizontal (mediano plazo):
- Separar backend y Ollama en nodos distintos.
- Agregar Redis para cache compartido.
- Balanceador para multiples instancias de API.

Escalabilidad funcional (largo plazo):
- Guardar leads e historial en base de datos.
- Integracion con CRM y automatizaciones comerciales.
- Dashboard de conversion y calidad de atencion.

## 11. Costos Operativos (Enfoque Actual)

- Costo principal: VPS (plan fijo).
- IA local: sin cobro por request/token.
- Costo variable adicional: solo si se activa fallback externo o se amplian recursos del VPS.

## 12. KPIs Recomendados

- Disponibilidad de endpoint de chat (% uptime).
- Latencia promedio y p95 de respuesta.
- Tasa de fallback y safe-mode.
- Tasa de derivacion a asesor.
- Conversion a lead calificado.

## 13. Estado Actual de Implementacion

- Backend hibrido implementado.
- Qwen en Ollama configurado como principal.
- Fallback Groq opcional y desactivado por defecto.
- Endpoint de salud y metadata de cache habilitados.
- Captura de leads y agendamiento de citas con Supabase.
- Confirmacion por email (si SMTP esta configurado).

## 14. Proxima Fase Recomendada

1. Despliegue productivo en VPS con servicios persistentes (Node + Ollama).
2. Monitoreo y alertas de salud/latencia.
3. Frontend full-screen de chat (sin icono flotante).
4. Persistencia de leads en base de datos.

## 15. Endpoints

- `POST /api/chat`: respuesta de chat con proveedor hibrido.
- `GET /api/chat`: estado LLM (proveedor principal, cooldown, fallback).
- `GET /api/properties`: propiedades con metadata de cache.
- `POST /api/leads`: registra lead (nombre, telefono, email, filtros).
- `GET /api/leads`: estado de configuracion de endpoint.
- `POST /api/appointments`: crea cita, valida cruces y envia confirmacion email.
- `GET /api/appointments`: estado de configuracion de endpoint.
- `GET /api/availability`: lista slots disponibles para agendar (sin cruces).
- `GET /api/health`: estado operativo general (LLM + cache).
- `GET /habby.js`: script cliente actual.

## 16. Variables de Entorno

### Datos inmobiliarios

| Variable | Descripcion | Default |
|---|---|---|
| `WP_URL` | URL base de WordPress | `https://habita.pe` |
| `MAX_PROPERTIES` | Maximo de propiedades por sync | `20` |
| `WHATSAPP_NUMBER` | Numero de asesor sin `+` | `51999999999` |

### LLM

| Variable | Descripcion | Default |
|---|---|---|
| `LLM_PRIMARY` | `ollama` o `groq` | `ollama` |
| `OLLAMA_BASE_URL` | endpoint de Ollama | `http://127.0.0.1:11434` |
| `OLLAMA_MODEL` | modelo principal local | `qwen2.5:7b-instruct` |
| `OLLAMA_TIMEOUT_MS` | timeout Ollama | `8000` |
| `OLLAMA_MAX_FAILS` | fallos para circuit breaker | `3` |
| `OLLAMA_COOLDOWN_MS` | tiempo de cooldown | `60000` |
| `LLM_ENABLE_GROQ_FALLBACK` | fallback externo opcional | `false` |
| `GROQ_API_KEY` | API key Groq (opcional) | - |
| `GROQ_MODEL` | modelo Groq | `llama-3.3-70b-versatile` |
| `GROQ_TIMEOUT_MS` | timeout Groq | `10000` |

### Supabase + Email

| Variable | Descripcion | Default |
|---|---|---|
| `SUPABASE_URL` | URL del proyecto Supabase | - |
| `SUPABASE_SERVICE_ROLE_KEY` | Key server-side (privada) | - |
| `SMTP_HOST` | Servidor SMTP | - |
| `SMTP_PORT` | Puerto SMTP | `587` |
| `SMTP_USER` | Usuario SMTP | - |
| `SMTP_PASS` | Password/Token SMTP | - |
| `SMTP_FROM` | Remitente visible en correos | `Habita Peru <no-reply@habita.pe>` |

### Agenda automatica

| Variable | Descripcion | Default |
|---|---|---|
| `SLOTS_DAYS_AHEAD` | Dias hacia adelante para sugerir horarios | `7` |
| `SLOT_MINUTES` | Duracion de cada slot | `30` |
| `WORK_START_HOUR` | Hora inicial (formato 24h) | `9` |
| `WORK_END_HOUR` | Hora final (formato 24h) | `18` |
| `WORK_DAYS` | Dias habiles (0=dom, 1=lun ... 6=sab) | `1,2,3,4,5,6` |
| `LOCAL_TZ_OFFSET_MINUTES` | Offset horario local respecto a UTC | `-300` |

## 17. Base de datos (Supabase)

1. Crea un proyecto en Supabase.
2. En SQL Editor ejecuta el script: `supabase/schema.sql`.
3. Copia `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` a tus variables de entorno del backend.

Tablas creadas:
- `leads`: datos de cliente y filtros de busqueda.
- `appointments`: citas agendadas con validacion de rango horario.
- `email_logs`: trazabilidad de envios de confirmacion.

### 17.1 Configuracion exacta en Supabase (paso a paso)

1. Crear proyecto:
- Organizacion: la tuya (ejemplo: sankarea270).
- Nombre del proyecto: `Habita`.
- Region: la mas cercana a Peru.
- Habilitar API de datos: activado.
- Habilitar RLS automatico: activado.

2. Obtener credenciales (en Supabase):
- Ruta: Project Settings > API.
- Copiar:
	- `Project URL` -> variable `SUPABASE_URL`.
	- `service_role` -> variable `SUPABASE_SERVICE_ROLE_KEY`.

3. Definir variables en el backend (VPS o Vercel):
- `SUPABASE_URL=https://<tu-proyecto>.supabase.co`
- `SUPABASE_SERVICE_ROLE_KEY=<tu-service-role-key>`

4. Seguridad obligatoria:
- Nunca exponer `SUPABASE_SERVICE_ROLE_KEY` en frontend.
- No poner claves en `public/habby.js`.
- Mantener HTTPS en produccion.
- Operar Supabase solo desde el backend.

5. Verificar conexion:
- `GET /api/leads` debe mostrar `configured: true`.
- `GET /api/appointments` debe mostrar `configured: true`.

## 18. Flujo automatizado (lead + cita)

1. Frontend envia datos a `POST /api/leads`.
2. Backend guarda lead y responde mensaje para pantalla (`uiMessage`).
3. Frontend consulta `GET /api/availability` para mostrar horarios libres.
4. Frontend agenda con `POST /api/appointments`.
5. Backend valida conflictos de horario antes de crear la cita.
6. Si hay email y SMTP configurado, envia confirmacion y registra log.
7. El endpoint responde con `uiMessage` para mostrar confirmacion inmediata en pantalla.

## 19. Verificacion Rapida

- `GET /api/health` debe responder `status: ok`.
- `GET /api/properties` debe traer propiedades y metadata de cache.
- `POST /api/chat` debe indicar `provider` (`ollama`, `groq`, `safe-mode`).
- `POST /api/leads` debe crear y devolver `lead.id`.
- `GET /api/availability` debe devolver `slots` disponibles.
- `POST /api/appointments` debe crear cita y devolver `uiMessage`.

## 20. Operacion temporal en Vercel y migracion final a VPS

### Temporal (pruebas ahora)

Para pruebas estables en Vercel sin Ollama accesible:

- `LLM_PRIMARY=groq`
- `LLM_ENABLE_GROQ_FALLBACK=false`

Con esto evitas `safe-mode` por falta de acceso a `127.0.0.1:11434` en serverless.

### Final (produccion VPS hibrida)

Cuando tengas acceso al VPS, usa perfil hibrido real:

- `LLM_PRIMARY=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `LLM_ENABLE_GROQ_FALLBACK=true`

Guia y plantillas listas en:

- `deploy/vps/MIGRACION_VPS.md`
- `deploy/vps/ecosystem.config.cjs`
- `deploy/vps/nginx-habby.conf`

### Smoke test reutilizable (Vercel o VPS)

- `npm run smoke -- --base https://habby-chatbot.vercel.app`
- `npm run smoke -- --base https://TU-DOMINIO-VPS`
