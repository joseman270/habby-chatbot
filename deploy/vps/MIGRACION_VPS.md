# Migración de Habby Chatbot a VPS (DirectAdmin)

Esta guía te permite correr Habby en VPS sin depender de tu laptop.

## 1) Estrategia recomendada

- **Ahora (temporal):** Vercel con `LLM_PRIMARY=groq`.
- **Final (VPS):** Híbrido real `ollama + groq fallback`.

## 2) Preparación en VPS

Requisitos sugeridos:
- Ubuntu 22.04+
- Node.js 20 LTS
- PM2
- Nginx
- Ollama

## 3) Despliegue de app Node

1. Subir código a: `/var/www/habby-chatbot`
2. Instalar dependencias:
   - `npm ci --omit=dev`
3. Copiar y ajustar `deploy/vps/ecosystem.config.cjs` (claves reales).
4. Iniciar con PM2:
   - `pm2 start deploy/vps/ecosystem.config.cjs`
   - `pm2 save`
   - `pm2 startup`

## 4) Instalar y probar Ollama en VPS

1. Instalar Ollama.
2. Descargar modelo:
   - `ollama pull qwen2.5:7b-instruct`
3. Verificar:
   - `curl http://127.0.0.1:11434/api/tags`

## 5) Reverse proxy (Nginx)

1. Usar `deploy/vps/nginx-habby.conf`.
2. Ajustar `server_name`.
3. Activar sitio y recargar Nginx.
4. Configurar SSL (Let's Encrypt).

## 6) Variables clave para VPS final (híbrido)

- `LLM_PRIMARY=ollama`
- `OLLAMA_BASE_URL=http://127.0.0.1:11434`
- `LLM_ENABLE_GROQ_FALLBACK=true`
- `GROQ_API_KEY=...`
- `SUPABASE_URL=...`
- `SUPABASE_SERVICE_ROLE_KEY=...`

## 7) Smoke test post-deploy

Desde el proyecto:
- `npm run smoke -- --base https://TU-DOMINIO`

Debe validar:
- `/api/chat` (GET)
- `/api/leads` (GET)
- `/api/appointments` (GET)
- `/api/availability` (GET)

## 8) Criterio de salida de Vercel

Cuando VPS cumpla:
- Responde endpoints correctamente
- Chat funciona con proveedor `ollama` y fallback operativo
- Leads + citas guardan en Supabase

Entonces:
- Cambiar frontend/widget a dominio VPS
- Dejar Vercel como contingencia o apagar
