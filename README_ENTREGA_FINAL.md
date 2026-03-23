# Informe de Entrega Final — Habby Chatbot (Habita Perú)

**Proyecto:** Habby Chatbot Inmobiliario  
**Cliente/Contexto:** Habita Perú  
**Stack principal:** Node.js + Vercel + Supabase + WordPress REST API + LLM híbrido (Ollama/Groq)  
**Fecha de cierre de informe:** 22/03/2026

---

## 1) Resumen ejecutivo

Se implementó un asistente inmobiliario que:

- Responde consultas de propiedades usando datos reales desde WordPress.
- Registra leads en Supabase.
- Agenda citas con validación de cruces horarias.
- Expone un panel de prueba para visualizar reservas/citas.
- Funciona en modo híbrido de IA con continuidad operativa (fallback y safe-mode).
- Opera actualmente en **fase de prueba como widget embebido**, con visión de evolución a **aplicación conversacional de pantalla completa**.

El resultado esperado para entrega se cumple en fase actual de operación temporal en Vercel y con migración final planificada a VPS.

### Aclaración de visión de producto (fase actual vs fase objetivo)

- **Fase actual (entregada):** interfaz tipo widget para validar flujo comercial, calidad de respuestas, captura de leads y agendamiento.
- **Fase objetivo (siguiente etapa):** reemplazar el bot antiguo por una **ventana completa** (full-screen), con frontend dedicado y experiencia integral alineada a marca, manteniendo el backend ya implementado.
- **Referencia funcional histórica:** `https://habita.pe/habby/` (a reemplazar por la nueva solución).

---

## 2) Objetivo general y objetivos específicos

### Objetivo general
Desplegar un chatbot inmobiliario confiable, medible y extensible, capaz de captar leads y convertirlos en citas agendadas.

### Objetivos específicos

1. Integrar catálogo de inmuebles desde WordPress REST API.
2. Diseñar backend API robusto para chat, leads, disponibilidad y citas.
3. Persistir información comercial en Supabase.
4. Implementar capa IA híbrida para resiliencia operativa.
5. Crear pruebas funcionales y smoke tests de verificación rápida.
6. Entregar documentación técnica y operativa para continuidad del proyecto.

---

## 3) Alcance funcional entregado

### Módulos entregados

- **Chat**: `POST /api/chat`, `GET /api/chat`
- **Propiedades**: `GET /api/properties`
- **Leads**: `POST /api/leads`, `GET /api/leads`
- **Disponibilidad**: `GET /api/availability`
- **Citas**: `POST /api/appointments`, `GET /api/appointments`
- **Panel (listado de citas)**: `GET /api/appointments?view=list&limit=...`
- **Health check**: `GET /api/health`
- **Widget**: `GET /habby.js`

### Entregables clave de código

- `api/*.js` (backend serverless + lógica de negocio)
- `public/habby.js` (widget de chat)
- `supabase/schema.sql` (modelo de datos)
- `scripts/smoke-test.mjs` (pruebas rápidas)
- `prueba.html` (panel de prueba de citas)
- `deploy/vps/*` (plantillas y guía de migración)

---

## 4) Arquitectura implementada

### 4.1 Capa de presentación

- **Widget embebible** (`public/habby.js`): experiencia flotante de chat usada como etapa de validación temporal.
- **Panel de prueba** (`prueba.html`): visualización de citas/reservas confirmadas.
- **Roadmap de interfaz**: migración de la experiencia actual a frontend de pantalla completa (no widget) en la fase de producto final.

### 4.2 Capa de servicios (API)

- API REST en Node.js (Express para ejecución local y funciones serverless en Vercel).
- Endpoints desacoplados por responsabilidad (`chat`, `leads`, `appointments`, etc.).

### 4.3 Capa de datos

- **Supabase (PostgreSQL)** para persistir leads, citas y logs de email.
- Restricciones de integridad (rangos válidos, estados permitidos).

### 4.4 Capa de IA

- **Primario configurable**: Ollama local (modelo Qwen).
- **Fallback opcional**: Groq.
- **Safe-mode** cuando no hay proveedor disponible.

---

## 5) Decisiones técnicas (qué se usó, por qué, ventajas y desventajas)

## 5.1 Node.js + Express

**Por qué se usó:**
- Rapidez de implementación.
- Ecosistema sólido para APIs y serverless.

**Ventajas:**
- Buen time-to-market.
- Mantenimiento simple.
- Integración natural con Vercel.

**Desventajas:**
- Requiere cuidado con concurrencia y timeouts.
- Mayor disciplina en observabilidad para producción.

## 5.2 Vercel (fase temporal)

**Por qué se usó:**
- Despliegue ágil para validación funcional.

**Ventajas:**
- Deploy rápido.
- Gestión simple de variables y rutas.

**Desventajas:**
- No ideal para Ollama local (no hay localhost persistente útil para inferencia local).
- Limitaciones de ejecución serverless para ciertos workloads.

## 5.3 Supabase

**Por qué se usó:**
- PostgreSQL administrado + API + velocidad de puesta en marcha.

**Ventajas:**
- Modelo relacional robusto.
- Integridad de datos y consultas simples.

**Desventajas:**
- Dependencia de correcta gestión de credenciales y RLS.

## 5.4 WordPress REST API

**Por qué se usó:**
- Fuente oficial del catálogo inmobiliario.

**Ventajas:**
- Evita doble registro de propiedades.
- Información actualizada desde el CMS del negocio.

**Desventajas:**
- Dependencia de disponibilidad del WordPress externo.

## 5.5 IA híbrida (Ollama + Groq)

**Por qué se usó:**
- Continuidad del servicio y control de costos.

**Ventajas:**
- Resiliencia ante caídas de proveedor.
- Posibilidad de operación local en VPS.

**Desventajas:**
- Mayor complejidad operativa.
- Ajustes de timeout/circuit-breaker obligatorios.

---

## 6) Flujo funcional principal (lead a cita)

1. Usuario conversa en el widget.
2. Se detecta intención de agendar.
3. Se solicita y registra lead (`POST /api/leads`).
4. Se consultan slots (`GET /api/availability`).
5. Usuario elige horario.
6. Se crea cita (`POST /api/appointments`) con validación de conflicto.
7. Se responde confirmación y, si SMTP está configurado, se envía email.
8. El panel consulta `GET /api/appointments?view=list` para visualizar reservas.

---

## 7) Pruebas y validaciones realizadas

## 7.1 Pruebas funcionales API

- Estado de endpoints (`GET` de diagnóstico).
- Creación real de leads y citas.
- Consulta de disponibilidad sin choques.
- Respuesta de chat con proveedor activo.

## 7.2 Pruebas de integración

- Integración WordPress → contexto de propiedades.
- Integración Supabase → persistencia y consulta.
- Integración widget → flujo completo de agendamiento.

## 7.3 Pruebas de despliegue

- Validación post-deploy en Vercel.
- Corrección de desalineación entre local y remoto (GitHub).
- Verificación final de `GET /api/appointments?view=list` con datos reales.

---

## 8) Riesgos detectados y mitigaciones

- **Riesgo:** desincronización local vs GitHub.  
  **Mitigación:** estrategia de merge y priorización de cambios locales vigentes.

- **Riesgo:** 404 en rutas no desplegadas.  
  **Mitigación:** revisar `vercel.json` y publicar rutas faltantes.

- **Riesgo:** dependencia de WordPress externo.  
  **Mitigación:** caché y mensajes de contingencia.

- **Riesgo:** proveedor IA no disponible.  
  **Mitigación:** fallback + safe-mode + canal humano.

---

## 9) Estado final de entrega

### 9.1 Cumplimientos

- Flujo de conversación operativo.
- Registro de leads operativo.
- Agendamiento de citas operativo.
- Listado de citas para panel operativo.
- Repositorio sincronizado con cambios actuales.
- Deploy funcional en entorno temporal.

### 9.2 Pendientes de fase siguiente

- Migración final a VPS (Node + Ollama + PM2 + Nginx).
- Endurecimiento de observabilidad (dashboards/alertas).
- Panel comercial completo (más allá del modo prueba).

---

## 10) Criterios de aceptación de entrega

Se considera aceptada esta fase si:

1. `POST /api/chat` responde correctamente.
2. `POST /api/leads` crea lead válido.
3. `POST /api/appointments` agenda cita sin conflicto.
4. `GET /api/appointments?view=list` retorna citas reales.
5. `prueba.html` muestra reservas usando la Base API de producción.

---

## 11) Recomendaciones de operación

1. Mantener `.env` versionado solo como `.env.example` (sin secretos).
2. Activar backups y políticas de retención en base de datos.
3. Definir rutina de smoke test post-deploy.
4. Documentar incidentes y retroalimentar prompts/flujo de negocio.
5. Ejecutar migración a VPS para etapa final de estabilidad híbrida.

---

## 12) Conclusión

El proyecto se entregó con funcionalidad clave operativa y comprobada en entorno real:

- Chat inmobiliario integrado con catálogo real.
- Captación comercial (leads) y conversión a citas.
- Visibilidad de reservas mediante panel de prueba.
- Base técnica sólida para escalar a producción final en VPS.

Este informe deja trazabilidad técnica y criterios claros para cierre de fase y continuidad.
