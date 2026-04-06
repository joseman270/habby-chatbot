# Migracion Final Habby Chatbot (DirectAdmin + Ollama)

Guia operativa final para cerrar el proyecto con foco en estabilidad backend y sin depender de creditos externos.

## 1) Contexto actual confirmado

- Host: `host2.fastglobalserver.com` (panel DirectAdmin en puerto `2222`)
- Home de cuenta: `/home/gqocw4j3nsf9`
- Recursos: CPU y disco suficientes para Ollama
- Base de datos actual de la app: **Supabase** (no MySQL)

Importante:
- Tener buen hardware no garantiza permisos de administrador.
- El punto critico para migrar Ollama al servidor es: **tener root/sudo**.

---

## 2) Paso 0: detectar si puedes instalar Ollama en el servidor

Ejecuta por SSH:

```bash
whoami
id
command -v sudo || echo "sin sudo"
sudo -n true && echo "sudo disponible" || echo "sudo no disponible"
systemctl is-system-running || true
```

Resultado esperado:
- Si tienes `sudo disponible`: sigue la **Ruta A**.
- Si sale `sudo no disponible`: sigue la **Ruta B**.

---

## 3) Ruta A (recomendada): tienes root/sudo en el servidor

### 3.1 Preparar runtime

En servidores AlmaLinux/Rocky 9:

```bash
sudo dnf update -y
sudo dnf install -y git curl
```

Node 20 + PM2 (usuario de app):

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
npm i -g pm2
```

### 3.2 Instalar Ollama

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama --version
```

Descargar modelos locales (sin creditos):

```bash
ollama pull qwen2.5:7b-instruct
ollama pull qwen2.5:3b-instruct
curl http://127.0.0.1:11434/api/tags
```

### 3.3 Desplegar backend Habby

```bash
mkdir -p /var/www
cd /var/www
git clone https://github.com/joseman270/habby-chatbot.git habby-chatbot
cd habby-chatbot
npm ci --omit=dev
```

Configurar variables con:
- `deploy/vps/ecosystem.config.cjs`

Iniciar con PM2:

```bash
pm2 start deploy/vps/ecosystem.config.cjs
pm2 save
pm2 startup
```

### 3.4 Publicar por dominio

Opciones:
- Si usas LiteSpeed/Apache de DirectAdmin: configurar reverse proxy a `127.0.0.1:3000`.
- Si administras Nginx aparte: usar `deploy/vps/nginx-habby.conf`.

---

## 4) Ruta B: no tienes root/sudo (cuenta DirectAdmin restringida)

En este caso no es estable correr Ollama 24/7 dentro del hosting.

### Arquitectura recomendada sin creditos

1. Backend en Vercel (o servidor Node externo que ya tengas).
2. Ollama corriendo en un nodo bajo tu control (PC, mini-servidor, otra VPS).
3. Exponer Ollama por tunnel seguro HTTPS.
4. Backend apuntando a ese `OLLAMA_BASE_URL`.

Ventajas:
- No consumes creditos por token.
- Mantienes modelo local.
- Evitas limitaciones de procesos del hosting compartido.

---

## 4.1 Ruta B2 (sin VPS extra y sin depender de tu PC): modo local sin LLM

Si no quieres contratar infraestructura adicional y no quieres depender de una PC encendida,
puedes operar en modo deterministico sin modelo externo.

Este modo ya esta soportado por el backend:

```env
CHAT_RULES_ONLY_MODE=true
LLM_ENABLE_GROQ_FALLBACK=false
```

Que hace este modo:
- Responde intenciones de agenda/contacto por reglas.
- Filtra propiedades del catalogo real de WordPress por coincidencia de texto.
- Evita consumo de creditos y evita dependencia de Ollama remoto.

Limitacion:
- No tiene redaccion generativa avanzada de un LLM.

Recomendado como plan estable de cierre cuando no hay root/sudo.

### Activacion en Vercel (5 minutos)

1. Ir a Vercel -> Project -> Settings -> Environment Variables.
2. Definir estas variables para Production:

```env
CHAT_RULES_ONLY_MODE=true
CHAT_ENABLE_RULES_FALLBACK=true
LLM_ENABLE_GROQ_FALLBACK=false
```

3. Guardar cambios y hacer `Redeploy` del ultimo commit de `main`.
4. Verificar API de modo:

```bash
curl https://TU-DOMINIO/api/chat
```

Debe mostrar:
- `chatMode.rulesOnly: true`
- `chatMode.rulesFallbackOnSafeMode: true`

5. Probar conversacion real:

```bash
curl -X POST https://TU-DOMINIO/api/chat \
	-H "Content-Type: application/json" \
	-d '{"messages":[{"role":"user","content":"busco depa en cusco para comprar"}],"profile":"comprador"}'
```

Resultado esperado:
- `provider: rules-only` o `provider: rules-fallback`
- Sin mensaje de "Estoy en modo seguro..." para usuario final.

---

## 5) Perfil recomendado sin creditos (ya soportado por el backend)

El backend ahora soporta fallback local de modelo Ollama:
- Primario: `OLLAMA_MODEL=qwen2.5:7b-instruct`
- Respaldo local: `OLLAMA_FALLBACK_MODEL=qwen2.5:3b-instruct`

Variables clave:

```env
LLM_PRIMARY=ollama
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen2.5:7b-instruct
OLLAMA_ENABLE_LOCAL_MODEL_FALLBACK=true
OLLAMA_FALLBACK_MODEL=qwen2.5:3b-instruct

# Sin creditos externos
LLM_ENABLE_GROQ_FALLBACK=false
GROQ_API_KEY=
```

Comportamiento:
- Si falla el 7b, intenta el 3b automaticamente.
- Si ambos fallan, entra en `safe-mode`.

Si no tienes donde correr Ollama 24/7:
- activar `CHAT_RULES_ONLY_MODE=true` hasta tener infraestructura con root.

---

## 6) Variables operativas actualizadas (citas, seguridad y CORS)

Usar como base:

```env
NODE_ENV=production
PORT=3000

WP_URL=https://habita.pe
MAX_PROPERTIES=20
WHATSAPP_NUMBER=51987654321

SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...

CORS_ALLOW_ORIGINS=https://habita.pe,https://habby.pe

# Ventana de citas: desde manana y 3 dias
SLOTS_MIN_DAYS_AHEAD=1
SLOTS_DAYS_AHEAD=3
SLOT_MINUTES=30
APPOINTMENT_MIN_LEAD_HOURS=12
WORK_START_HOUR=9
WORK_END_HOUR=18
WORK_DAYS=1,2,3,4,5,6
LOCAL_TZ_OFFSET_MINUTES=-300
```

---

## 7) Sobre phpMyAdmin en este proyecto

- Tu acceso `phpMyAdmin` es util para MySQL/MariaDB del hosting.
- Habby hoy persiste leads/citas en Supabase, no en MySQL local.
- No necesitas migrar a phpMyAdmin para cerrar este proyecto.

Solo usar MySQL/phpMyAdmin si decides una migracion futura de datos fuera de Supabase.

---

## 8) Validaciones obligatorias post-deploy

### 8.1 Health

```bash
curl https://TU-DOMINIO/api/health
```

Verificar:
- `status: ok`
- `llm.primary: ollama`

### 8.2 Disponibilidad de citas (sin mismo dia)

```bash
curl "https://TU-DOMINIO/api/availability?days=3&min_days=1&slot_minutes=30"
```

Verificar:
- `sameDayBlocked: true`
- slots desde manana

### 8.3 Chat de agenda

Enviar mensaje: `quiero agendar una cita`

Verificar:
- Respuesta de flujo de cita (o `provider: rule-based`)
- No respuesta fuera de contexto inmobiliario

### 8.4 Smoke test general

```bash
npm run smoke -- --base https://TU-DOMINIO
```

---

## 9) Plan de cierre recomendado (orden final)

1. Confirmar si tienes root/sudo (Ruta A o B).
2. Dejar variables finales de entorno.
3. Deploy backend.
4. Validar `/api/health`, `/api/availability`, `/api/chat`, `/api/appointments`.
5. Apuntar frontend/widget al backend final.
6. Monitorear 48h errores y latencia.

Si estas en hosting sin sudo:
1. Activar primero Ruta B2 en Vercel.
2. Confirmar atencion comercial estable sin creditos.
3. Evaluar infraestructura con root solo cuando quieras reactivar Ollama 24/7.

Con este flujo cierras el proyecto con resiliencia real, sin depender de creditos para el camino principal.
