# Playbook de Release por Fases — Habby (Git + Vercel)

## Objetivo

Estandarizar cómo subir cambios de las fases (UX conversacional, cards visuales, rediseño y conversión) con validación técnica y funcional.

---

## Estrategia de ramas

- `main`: rama estable (solo merge con QA en verde).
- `feature/fase-1-texto-emojis`
- `feature/fase-2-cards-propiedades`
- `feature/fase-3-rediseno-widget`
- `feature/fase-4-conversion-tracking`

---

## Checklist por Pull Request

1. Alcance de fase completo.
2. Sin errores de sintaxis (`get_errors` / editor en verde).
3. Regresión de chat aprobada:
   - `npm run chat:qa -- --base http://localhost:3000`
4. Smoke test aprobado (entorno con variables completas):
   - `npm run smoke -- --base http://localhost:3000`
5. Evidencia visual responsive:
   - móvil (<420)
   - tablet
   - desktop
6. Verificación de fallback (sin imágenes o sin LLM) sin ruptura UX.

---

## Flujo recomendado Git + Vercel

1. Crear rama de fase.
2. Implementar cambios y commitear por bloques pequeños.
3. Abrir PR hacia `main` con checklist de QA.
4. Validar Preview Deployment en Vercel.
5. Ejecutar `chat:qa` y `smoke` contra Preview (si aplica).
6. Aprobar PR y mergear a `main`.
7. Validar producción inmediatamente con:
   - `npm run chat:qa -- --base https://habby-chatbot.vercel.app`
   - `npm run smoke -- --base https://habby-chatbot.vercel.app`

---

## Release Gate (criterios de aprobación)

- 0 errores críticos en chat, leads y citas.
- Regresión conversacional en verde.
- Diseño consistente en móvil/desktop.
- Cards renderizando cuando hay propiedades relevantes.
- Fallback de imagen y fallback IA funcionando.

---

## Rollback plan

Si producción falla:

1. Revertir último merge en `main`.
2. Promover último deploy estable en Vercel.
3. Re-ejecutar `chat:qa` + `smoke` en producción.
4. Abrir hotfix branch con corrección puntual.

---

## Variables mínimas para entorno local completo

Archivo `.env` requerido con:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `WP_URL`
- `WHATSAPP_NUMBER`
- `DEFAULT_PROPERTY_IMAGE_URL` (opcional)

Sin Supabase configurado, `/api/availability` y pruebas de agenda no podrán validar al 100%.
