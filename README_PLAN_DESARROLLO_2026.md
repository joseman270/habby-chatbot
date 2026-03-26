# Plan de Desarrollo desde Cero (Cronograma Diario)

**Proyecto:** Habby Chatbot Inmobiliario  
**Rango solicitado:** 22/03/2026 al 12/06/2026  
**Jornada:** Lunes a Viernes, 6 horas por día  
**Días laborables reales en el rango:** **60 días** (del 23/03/2026 al 12/06/2026)

---

## 1) Supuestos de planificación

- Se considera inicio efectivo el siguiente día hábil: **23/03/2026**.
- Trabajo de lunes a viernes (sin feriados adicionales considerados).
- Equipo base: 1 líder técnico + 1 dev full-stack + 1 QA (roles pueden ser una misma persona en proyecto pequeño).
- Metodología: iterativa semanal con validaciones funcionales continuas.

---

## 2) Objetivo del plan

Construir desde cero un chatbot inmobiliario con:

- Integración a catálogo WordPress.
- Backend API para chat, leads, disponibilidad y citas.
- Persistencia en Supabase.
- Despliegue temporal en Vercel.
- Fase de prueba inicial en formato **widget**.
- Evolución planificada a **frontend de pantalla completa** para reemplazar la experiencia anterior.
- Pruebas funcionales y de integración.
- Documentación final de entrega.

---

## 3) Estructura de fases

1. **Inicio y análisis** (Días 1–5)
2. **Diseño técnico y base del proyecto** (Días 6–12)
3. **MVP de chat + propiedades** (Días 13–22)
4. **Leads, disponibilidad y citas** (Días 23–36)
5. **Calidad, resiliencia y observabilidad** (Días 37–46)
6. **Panel de prueba, cierre técnico y entrega** (Días 47–60)

---

## 4) Cronograma diario (60 jornadas)

> Formato: **Objetivo del día** + **Meta verificable** + **Pruebas del día**.

| Día | Fecha | Objetivo (6h) | Meta del día | Pruebas / Evidencia |
|---|---|---|---|---|
| 1 | 2026-03-23 | Kickoff, alcance y requisitos | Backlog inicial aprobado | Checklist de requisitos firmado |
| 2 | 2026-03-24 | Levantamiento de casos de uso | 10+ casos de uso priorizados | Revisión con matriz MoSCoW |
| 3 | 2026-03-25 | Definir arquitectura macro | Diagrama de arquitectura v1 | Walkthrough técnico |
| 4 | 2026-03-26 | Definir modelo de datos funcional | ERD preliminar (leads/citas/logs) | Validación de campos críticos |
| 5 | 2026-03-27 | Plan de riesgos y mitigaciones | Registro de riesgos v1 | Revisión de riesgos top 10 |
| 6 | 2026-03-30 | Inicializar repositorio y estructura | Estructura base creada | Build local inicial OK |
| 7 | 2026-03-31 | Configurar entorno Node y scripts | `start`, `dev`, `smoke` definidos | Ejecución de scripts en local |
| 8 | 2026-04-01 | Configurar rutas API iniciales | Endpoints base respondiendo | Test manual de rutas base |
| 9 | 2026-04-02 | Configurar variables de entorno | `.env.example` completo | Validación de variables requeridas |
| 10 | 2026-04-03 | Definir estrategia de errores API | Estructura de errores uniforme | Prueba de códigos HTTP |
| 11 | 2026-04-06 | Integrar cliente WordPress REST | Conector de propiedades listo | Llamada real a WP exitosa |
| 12 | 2026-04-07 | Implementar caché de propiedades | Cache hit/miss funcionando | Prueba con caída simulada WP |
| 13 | 2026-04-08 | Diseñar prompt del asistente | Prompt base inmobiliario | Pruebas con 20 preguntas ejemplo |
| 14 | 2026-04-09 | Crear endpoint `POST /api/chat` | Chat responde con contexto | Test de conversación básica |
| 15 | 2026-04-10 | Crear endpoint estado chat | `GET /api/chat` operativo | Validación de JSON de estado |
| 16 | 2026-04-13 | Integrar LLM primario | Proveedor primario funcional | Prueba de latencia promedio |
| 17 | 2026-04-14 | Integrar fallback LLM | Fallback configurable activo | Simulación de caída primario |
| 18 | 2026-04-15 | Implementar safe-mode | Respuesta de contingencia correcta | Prueba de no disponibilidad total |
| 19 | 2026-04-16 | Afinar formato de respuestas | Estilo de salida consistente | Test UX conversacional |
| 20 | 2026-04-17 | Añadir canal de derivación (WhatsApp) | Link de derivación integrado | Prueba de derivación manual |
| 21 | 2026-04-20 | Diseñar flujo de captura de lead | Flujo UX definido | Prueba de flujo extremo a extremo |
| 22 | 2026-04-21 | Documentar MVP de chat | Documento MVP v1 | Revisión técnica interna |
| 23 | 2026-04-22 | Preparar proyecto Supabase | Proyecto y credenciales listos | Test conexión desde backend |
| 24 | 2026-04-23 | Crear esquema SQL inicial | Tablas `leads`, `appointments`, `email_logs` | Ejecución de `schema.sql` |
| 25 | 2026-04-24 | Añadir constraints e índices | Integridad de datos activa | Inserciones inválidas rechazadas |
| 26 | 2026-04-27 | Implementar `POST /api/leads` | Registro de lead operativo | Test datos válidos/inválidos |
| 27 | 2026-04-28 | Implementar `GET /api/leads` | Estado endpoint visible | Test diagnóstico OK |
| 28 | 2026-04-29 | Diseñar algoritmo de slots | Lógica base de agenda definida | Casos horarios cubiertos |
| 29 | 2026-04-30 | Implementar `GET /api/availability` | Slots disponibles listados | Prueba 7 días / 30 min |
| 30 | 2026-05-01 | Test de choques de horario | Reglas de no solapamiento validadas | Casos borde verificados |
| 31 | 2026-05-04 | Implementar `POST /api/appointments` | Creación de citas operativa | Test alta de cita real |
| 32 | 2026-05-05 | Validar conflicto de citas (409) | Bloqueo de cruce funcionando | Prueba de doble reserva |
| 33 | 2026-05-06 | Implementar `GET /api/appointments` estado | Diagnóstico endpoint listo | Health funcional |
| 34 | 2026-05-07 | Integrar email de confirmación (SMTP) | Envío condicionado por config | Test con/ sin SMTP |
| 35 | 2026-05-08 | Registrar logs de email | Trazabilidad en `email_logs` | Verificación de inserts |
| 36 | 2026-05-11 | Integrar flujo completo widget→cita | Flujo E2E de agenda operativo | Prueba completa en navegador |
| 37 | 2026-05-12 | Endurecer validaciones de input | Sanitización y límites activos | Fuzz básico de entradas |
| 38 | 2026-05-13 | Mejorar manejo de errores externos | Mensajes de contingencia útiles | Simulación de timeouts |
| 39 | 2026-05-14 | Implementar endpoint de salud global | `GET /api/health` operativo | Verificación JSON de salud |
| 40 | 2026-05-15 | Afinar timeouts y circuit-breaker | Parámetros de resiliencia estables | Test de degradación controlada |
| 41 | 2026-05-18 | Preparar despliegue temporal Vercel | Config serverless lista | Dry-run de rutas |
| 42 | 2026-05-19 | Publicar y validar deploy temporal | API accesible en dominio público | Smoke test remoto |
| 43 | 2026-05-20 | Corregir hallazgos post-deploy | Errores críticos resueltos | Re-test funcional |
| 44 | 2026-05-21 | Verificar variables de entorno productivas | Config establecida | Check endpoints de estado |
| 45 | 2026-05-22 | Ejecutar smoke test automatizado | Script smoke validado | Evidencia de ejecución |
| 46 | 2026-05-25 | Congelar versión candidata (RC1) | RC1 etiquetada | Checklist de release |
| 47 | 2026-05-26 | Diseñar panel de prueba de citas | UI base definida | Mock de panel validado |
| 48 | 2026-05-27 | Implementar query listado citas | `view=list` en appointments | Test de respuesta con array |
| 49 | 2026-05-28 | Integrar panel con endpoint real | Tarjetas de citas visibles | Prueba con datos reales |
| 50 | 2026-05-29 | Añadir filtros y recarga en panel | Filtro por estado/límite | Test funcional de filtros |
| 51 | 2026-06-01 | Definir UX final no-widget (full-screen) | Wireframe de ventana completa aprobado | Revisión UX/UI con stakeholders |
| 52 | 2026-06-02 | Integrar frontend full-screen con APIs existentes | Navegación y flujo conversacional operativo | E2E inicial en pantalla completa |
| 53 | 2026-06-03 | Resolver conflictos de integración Git | Rama principal consistente | Merge limpio validado |
| 54 | 2026-06-04 | Sincronizar remoto y deploy | Repositorio y despliegue alineados | Push + verificación remota |
| 55 | 2026-06-05 | Pruebas de regresión API (widget + full-screen) | Sin ruptura de endpoints previos | Matriz de regresión OK |
| 56 | 2026-06-08 | Redactar informe técnico de entrega | Informe versión candidata | Revisión de contenido |
| 57 | 2026-06-09 | Redactar documentación de operación | Manual técnico-operativo | Checklist de operación |
| 58 | 2026-06-10 | Preparar plan de migración a VPS | Guía de migración lista | Validación de pasos |
| 59 | 2026-06-11 | Validación final con stakeholders | Aprobación funcional | Acta de conformidad técnica |
| 60 | 2026-06-12 | Cierre de proyecto y entrega formal | Entrega final completada | Paquete final + handoff |

---

## 5) Estrategia de pruebas (incluida en el plan)

### 5.1 Tipos de pruebas ejecutadas

- **Pruebas unitarias ligeras** de validación de entradas y utilidades.
- **Pruebas funcionales API** por endpoint.
- **Pruebas de integración** (WordPress, Supabase, SMTP, LLM).
- **Pruebas E2E** del flujo completo desde chat hasta cita.
- **Pruebas post-deploy** (smoke test remoto).

### 5.2 Criterios de salida por fase

- No hay errores críticos sin plan de mitigación.
- Endpoints principales responden dentro de latencias esperadas.
- Flujo comercial principal (lead + cita) comprobado.
- Documentación actualizada y coherente con la versión desplegada.

---

## 6) Carga total de trabajo estimada

- **60 días hábiles × 6 horas/día = 360 horas efectivas.**

Distribución referencial:

- Análisis y diseño: 54 h
- Desarrollo backend: 138 h
- Integraciones y datos: 72 h
- QA y hardening: 54 h
- Documentación y cierre: 42 h

---

## 7) Riesgos de cronograma y control

- **Riesgo:** bloqueo por conflicto de integración Git.  
  **Control:** estrategia de ramas + checklist pre-merge.

- **Riesgo:** cambios de alcance tardíos.  
  **Control:** gestión por backlog y corte de alcance por fase.

- **Riesgo:** dependencia de servicios externos (WP/SMTP/LLM).  
  **Control:** cache, fallback y pruebas de contingencia.

---

## 8) Conclusión del plan

Con este cronograma diario de 60 jornadas laborables, el proyecto puede ejecutarse de forma ordenada, medible y trazable hasta su cierre, manteniendo objetivos diarios claros, metas verificables y pruebas continuas para asegurar calidad de entrega.

La ejecución contempla explícitamente una transición por fases: **primero widget de validación**, luego **producto final en pantalla completa** con frontend dedicado, reutilizando el backend ya estabilizado.
