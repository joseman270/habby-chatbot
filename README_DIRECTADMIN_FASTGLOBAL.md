# Despliegue en DirectAdmin (FastGlobal)

Guia operativa para publicar Habby en `https://habita.pe/habby` con Node.js en DirectAdmin.

## 1) Configuracion de App en DirectAdmin

En `Create Web Application` usa:

- Node.js version: `20.x`
- Application mode: `Production`
- Application root: `/home/gqocw4j3nsf9/domains/habita.pe/public_html/habby`
- Application URL: `https://habita.pe/habby`
- Startup file: `index.js`

## 2) Archivos obligatorios en la carpeta `/habby`

Deben existir:

- `package.json`
- `index.js`
- carpeta `api/`
- carpeta `public/`

## 3) Subida recomendada por Git + SSH

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

Luego reinicia la app desde DirectAdmin.

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
curl -sS https://habita.pe/habby/api/health
curl -sS https://habita.pe/habby/api/chat
```

## 6) Insercion en WordPress

En footer (o bloque HTML global):

```html
<script src="https://habita.pe/habby/habby.js" defer></script>
```

## 7) Nota importante del widget

El widget detecta automaticamente el `API_BASE` segun su URL:

- `https://habita.pe/habby/habby.js` -> `https://habita.pe/habby/api/...`
- `https://chat.habita.pe/habby.js` -> `https://chat.habita.pe/api/...`

Si quieres forzar API manualmente:

```html
<script>window.HABBY_API_BASE='https://habby-chatbot.vercel.app/api';</script>
<script src="https://habita.pe/habby/habby.js" defer></script>
```

## 8) Solucion al error: "problema de conexion"

Si aparece:

`⚠️ Parece que hubo un problema de conexión...`

revisa en este orden:

1. App Node realmente iniciada en DirectAdmin (Restart App).
2. `https://habita.pe/habby/api/chat` responde JSON.
3. `CORS_ALLOW_ORIGINS` incluye `https://habita.pe` y `https://www.habita.pe`.
4. Variables de Supabase y Gemini/Groq correctamente guardadas.
5. Ejecutar de nuevo `npm ci --omit=dev` y reiniciar.

El frontend ahora usa fallback automatico de base API para reducir caidas por ruta/host incorrectos.
