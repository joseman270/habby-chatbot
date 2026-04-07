# Despliegue en DirectAdmin (FastGlobal) - Visualizacion Completa

Guia operativa para publicar Habby en `https://habita.pe/habby` con Node.js en DirectAdmin.

## 1) Configuracion de App en DirectAdmin

En `Create Web Application` usa:

- Node.js version: `20.x`
- Application mode: `Production` (no `Development`)
- Application root: `/home/gqocw4j3nsf9/domains/habita.pe/public_html/habby`
- Application URL: `/habby` (solo la ruta; el dominio ya se selecciona en el combo de la izquierda)
- Startup file: `index.js`

## 2) Que subir exactamente a la carpeta `/habby`

En la raiz de `/habby` deben existir:

- `package.json`
- `package-lock.json`
- `index.js`
- `chat-completo.html` (pantalla completa sin widget)
- carpeta `api/`
- carpeta `public/`

No subir:

- `node_modules/`
- `.git/`
- archivo `.env` con secretos

## 3) Subida recomendada por Git + SSH

Este bloque funciona bien si `habby` no existe o si `habby` ya es un repo Git.

```bash
cd /home/gqocw4j3nsf9/domains/habita.pe/public_html

if [ ! -d habby/.git ]; then
  git clone https://github.com/joseman270/habby-chatbot.git habby
fi

cd habby
git checkout main
git pull origin main
npm ci --omit=dev
```

Si `habby` ya existe pero NO tiene `.git` (por ejemplo, subida manual por ZIP/FTP), no uses `git clone` dentro de esa carpeta. En ese caso:

1. Copia/sube los archivos del proyecto a `/public_html/habby`.
2. Ejecuta `npm ci --omit=dev` dentro de `/public_html/habby`.
3. Reinicia la app desde DirectAdmin.

Si aparece este error al clonar:

fatal: destination path 'habby' already exists and is not an empty directory.

usa este flujo seguro (crea respaldo y vuelve a clonar limpio):

```bash
cd /home/gqocw4j3nsf9/domains/habita.pe/public_html
mv habby habby_backup_$(date +%Y%m%d_%H%M%S)
git clone https://github.com/joseman270/habby-chatbot.git habby
cd habby
git checkout main
git pull origin main
npm ci --omit=dev
```

Luego reinicia la app desde DirectAdmin (`Restart App`).

## 4) Variables de entorno minimas (sin Ollama)

```env
NODE_ENV=production
PORT=3000

WP_URL=https://habita.pe
MAX_PROPERTIES=20
WHATSAPP_NUMBER=51987654321

LLM_PRIMARY=gemini
GEMINI_API_KEY=TU_GEMINI_API_KEY
GEMINI_MODEL=gemini-2.5-flash
GEMINI_TIMEOUT_MS=10000

LLM_ENABLE_GEMINI_FALLBACK=true
LLM_ENABLE_GROQ_FALLBACK=true
GROQ_API_KEY=TU_GROQ_API_KEY
GROQ_MODEL=llama-3.3-70b-versatile
GROQ_TIMEOUT_MS=10000

LLM_ENABLE_OLLAMA_FALLBACK=false

LLM_BUDGET_GUARD_ENABLED=true
LLM_BUDGET_SWITCH_THRESHOLD=0.80
LLM_QUOTA_COOLDOWN_MS=3600000
GEMINI_DAILY_SOFT_LIMIT_RPD=600
GROQ_DAILY_SOFT_LIMIT_RPD=350
OLLAMA_DAILY_SOFT_LIMIT_RPD=0

CHAT_RULES_ONLY_MODE=false
CHAT_ENABLE_RULES_FALLBACK=true
PROPERTY_CONTEXT_MAX_ITEMS=6

SUPABASE_URL=TU_SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY=TU_SUPABASE_SERVICE_ROLE_KEY

CORS_ALLOW_ORIGINS=https://habita.pe,https://www.habita.pe

SLOTS_MIN_DAYS_AHEAD=1
SLOTS_DAYS_AHEAD=3
SLOT_MINUTES=30
APPOINTMENT_MIN_LEAD_HOURS=12
WORK_START_HOUR=9
WORK_END_HOUR=18
WORK_DAYS=1,2,3,4,5,6
LOCAL_TZ_OFFSET_MINUTES=-300
```

## 5) Verificacion despues del restart

```bash
curl -I https://habita.pe/habby/chat-completo.html
curl -I https://habita.pe/habby/public/habby.js
curl -I https://habita.pe/habby/api/health
curl -sS https://habita.pe/habby/api/chat
```

Resultado esperado:

- `chat-completo.html` responde `200`
- `public/habby.js` responde `200`
- `/api/health` responde `200` con JSON
- `/api/chat` devuelve JSON

Si `/api/health` devuelve `404` con cabeceras de WordPress, la app Node no esta montada en `/habby` (revisar Application URL, crear/recrear app y reiniciar).

## 6) Publicacion en WordPress (sin widget)

Para visualizacion completa, usa una pagina que abra esta URL:

- `https://habita.pe/habby/chat-completo.html`

Opciones recomendadas:

1. Menu o boton directo a esa URL.
2. Pagina de WordPress con `iframe` a pantalla completa.
3. Redireccion desde una pagina interna (ejemplo: `/asesor-virtual`).

Nota: `chat-completo.html` ya configura `window.HABBY_API_BASE` a `https://habita.pe/habby/api` cuando detecta que esta en `/habby`, para evitar rutas equivocadas en produccion.

Ejemplo de `iframe`:

```html
<iframe
  src="https://habita.pe/habby/chat-completo.html"
  style="width:100%;min-height:85vh;border:0;border-radius:12px;"
  loading="lazy"
  referrerpolicy="strict-origin-when-cross-origin"
></iframe>
```

## 7) Checklist rapido (modo visualizacion completa)

1. Crear app Node con `Production`, root en `/public_html/habby`, URL `/habby`, startup `index.js`.
2. Subir proyecto completo a `/public_html/habby` (sin `node_modules`, sin `.git`, sin `.env`).
3. Ejecutar `npm ci --omit=dev` dentro de `/habby`.
4. Cargar variables de entorno y hacer `Restart App`.
5. Confirmar `200` en `chat-completo.html`, `public/habby.js`, `/api/health` y JSON en `/api/chat`.
6. En WordPress, enlazar o embeber `https://habita.pe/habby/chat-completo.html`.

## 8) Opcional: widget (solo si lo reactivas)

El widget detecta automaticamente el `API_BASE` segun su URL:

- `https://habita.pe/habby/habby.js` -> `https://habita.pe/habby/api/...`
- `https://chat.habita.pe/habby.js` -> `https://chat.habita.pe/api/...`

Si quieres forzar API manualmente:

```html
<script>window.HABBY_API_BASE='https://habby-chatbot.vercel.app/api';</script>
<script src="https://habita.pe/habby/habby.js" defer></script>
```

## 9) Solucion al error: "problema de conexion"

Si aparece:

`⚠️ Parece que hubo un problema de conexión...`

revisa en este orden:

1. App Node realmente iniciada en DirectAdmin (Restart App).
2. En Create Application: `Application mode=Production` y `Application URL=/habby`.
3. `https://habita.pe/habby/api/chat` responde JSON.
4. `CORS_ALLOW_ORIGINS` incluye `https://habita.pe` y `https://www.habita.pe`.
5. Variables de Supabase y Gemini/Groq correctamente guardadas.
6. Ejecutar de nuevo `npm ci --omit=dev` y reiniciar.

El frontend ahora usa fallback automatico de base API para reducir caidas por ruta/host incorrectos.

## 10) Respaldo temporal (si DirectAdmin aun no enruta `/habby/api`)

Mientras cierras el enrutamiento en DirectAdmin, puedes mantener operativo el widget desde Vercel:

```html
<script src="https://habby-chatbot.vercel.app/habby.js" defer></script>
```

Cuando `/habby/api/health` ya responda `200`, vuelve al script final:

```html
<script src="https://habita.pe/habby/habby.js" defer></script>
```
