# Instalación de Ollama en DirectAdmin — FastGlobal Server

**Proyecto:** Habby Chatbot (Habita Perú)  
**Objetivo:** Desplegar Ollama con qwen2.5:7b-instruct en VPS DirectAdmin  
**Fecha:** Abril 2026  
**Stack:** Node.js + PM2 + Ollama + Nginx (reverse proxy opcional)

---

## 📋 Preguntas Iniciales (Checklist Pre-Instalación)

Antes de comenzar, confirma estos puntos:

1. **¿Tienes acceso SSH al servidor?** ¿Cuál es el usuario (root o usuario específico)?
   - [ ] Acceso SSH confirmado
   - [ ] Usuario: `_________`
   - [ ] Host/IP: `_________`

2. **¿Qué SO tiene el servidor?** (Parece que Ubuntu 22.04+ según tu docs)
   - [ ] Ubuntu 22.04+
   - [ ] CentOS/RHEL
   - [ ] Otra: `_________`

3. **¿Tu servidor tiene GPU o será CPU únicamente?**
   - [ ] GPU (CUDA/ROCm disponible)
   - [ ] CPU únicamente

4. **¿Ya está instalado Node.js y tu chatbot corriendo?**
   - [ ] Node.js 20 LTS instalado
   - [ ] Proyecto en `/var/www/habby-chatbot`
   - [ ] PM2 configurado

5. **¿Necesitas acceso a Ollama desde la web o solo internamente (127.0.0.1)?**
   - [ ] Solo interno (localhost:11434)
   - [ ] Acceso web (con autenticación/firewall)

---

## 🚀 Plan General de Despliegue

Este es el flujo que seguiremos:

```
1. SSH al servidor VPS
2. Instalar Ollama (script + inicio automático)
3. Descargar modelo: qwen2.5:7b-instruct
4. Verificar que corre en puerto 11434
5. Configurar Nginx para reverso (opcional si es solo local)
6. Actualizar ecosystem.config.cjs con credenciales reales
7. Iniciar chatbot con PM2
8. Probar endpoints con smoke test
```

---

## ✅ Paso 1: Acceso SSH al Servidor VPS

### 1.1 Conectarse al servidor

```bash
ssh usuario@tu-servidor-ip
# o si usas Puerto específico:
ssh -p 2222 usuario@tu-servidor-ip
```

**Nota:** En DirectAdmin, típicamente:
- Usuario: `root` o usuario de administrador DirectAdmin
- Puerto: 22 (estándar) o personalizado

### 1.2 Verificar acceso root

Si no estás en root, cambiar:

```bash
sudo su -
# O sin sudo si ya eres admin
```#como se si soy admin si no se si tengo sudo

### 1.3 Validar SO

```bash
cat /etc/os-release
uname -a
```

Esperado: Ubuntu 22.04+ o CentOS 8+

---

## 📦 Paso 2: Instalar Ollama

### 2.1 Descargar e instalar el script oficial

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

O si prefieres verlo antes de ejecutar:

```bash
curl -fsSL https://ollama.ai/install.sh > /tmp/ollama-install.sh
cat /tmp/ollama-install.sh  # Revisar contenido
bash /tmp/ollama-install.sh
```

### 2.2 Verificar instalación

```bash
ollama --version
```

Esperado: `ollama version X.X.X`

### 2.3 Iniciar servicio Ollama

```bash
# Iniciar el servicio
systemctl start ollama

# Verificar estado
systemctl status ollama

# Habilitar inicio automático en boot
systemctl enable ollama
```

**Esperado:** `Active: active (running)`

### 2.4 Verificar puerto 11434

```bash
netstat -tlnp | grep 11434
# o
ss -tlnp | grep 11434
```

Esperado: `tcp  ... LISTEN ... ollama`

---

## 🤖 Paso 3: Descargar Modelo

### 3.1 Descargar qwen2.5:7b-instruct

```bash
# Esto puede tardar 5-15 min dependiendo de tu ancho de banda
ollama pull qwen2.5:7b-instruct
```

**Nota:** El modelo pesa ~5GB aproximadamente.

### 3.2 Verificar descarga

```bash
curl http://127.0.0.1:11434/api/tags
```

Esperado: respuesta JSON con lista de modelos, incluyendo `qwen2.5:7b-instruct`

```json
{
  "models": [
    {
      "name": "qwen2.5:7b-instruct",
      "modified_at": "...",
      "size": ...
    }
  ]
}
```

### 3.3 Probar modelo con prompt simple

```bash
curl http://127.0.0.1:11434/api/generate \
  -d '{
    "model": "qwen2.5:7b-instruct",
    "prompt": "Hola ¿Cómo estás?",
    "stream": false
  }'
```

Esperado: respuesta generada por el modelo.

---

## 🔧 Paso 4: Configurar Nginx (Reverse Proxy Opcional)

**Nota:** Solo si necesitas acceso desde web. Si es local (localhost:11434), **omite este paso**.

### 4.1 Copiar configuración

```bash
# Desde tu máquina local, copiar archivo al servidor
scp deploy/vps/nginx-habby.conf usuario@servidor:/tmp/

# O si usas Git en el servidor:
cd /var/www/habby-chatbot
git pull origin main
```

### 4.2 Editar configuración para Ollama

Si necesitas exposición web, crea un bloque adicional en Nginx:

```nginx
upstream ollama_backend {
    server 127.0.0.1:11434;
}

server {
    listen 80;
    server_name ollama.tu-dominio.com;

    # Redirigir a HTTPS (recomendado)
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ollama.tu-dominio.com;

    ssl_certificate /ruta/a/cert.pem;
    ssl_certificate_key /ruta/a/key.pem;

    location / {
        proxy_pass http://ollama_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_http_version 1.1;
        proxy_set_header Connection "upgrade";
        proxy_buffering off;
    }
}
```

### 4.3 Activar sitio Nginx

```bash
# En DirectAdmin, típicamente usas:
# - /etc/nginx/sites-available/ y /etc/nginx/sites-enabled/
# - O /etc/nginx/conf.d/

# Crear symlink (Ubuntu/Debian)
ln -s /etc/nginx/sites-available/ollama.conf /etc/nginx/sites-enabled/

# Verificar sintaxis
nginx -t

# Recargar Nginx
systemctl reload nginx
```

### 4.4 SSL con Let's Encrypt (opcional pero recomendado)

```bash
# Instalar certbot si no lo tienes
apt-get install certbot python3-certbot-nginx

# Obtener certificado
certbot --nginx -d ollama.tu-dominio.com
```

---

## ⚙️ Paso 5: Actualizar Configuración de Chatbot (ecosystem.config.cjs)

### 5.1 Abrir archivo en servidor

```bash
nano /var/www/habby-chatbot/deploy/vps/ecosystem.config.cjs
```

### 5.2 Llenar credenciales reales

Busca estas líneas y completa con tus valores:

```javascript
env: {
  NODE_ENV: 'production',
  PORT: 3000,

  WP_URL: 'https://habita.pe',                    // Tu WordPress
  MAX_PROPERTIES: '20',
  WHATSAPP_NUMBER: '51999999999',                 // Tu WhatsApp

  // Ollama local
  LLM_PRIMARY: 'ollama',
  OLLAMA_BASE_URL: 'http://127.0.0.1:11434',      // OK si es local
  OLLAMA_MODEL: 'qwen2.5:7b-instruct',            // Confirmado arriba
  OLLAMA_TIMEOUT_MS: '8000',
  OLLAMA_MAX_FAILS: '3',
  OLLAMA_COOLDOWN_MS: '60000',

  // Groq fallback (obtén API key en groq.com)
  LLM_ENABLE_GROQ_FALLBACK: 'true',
  GROQ_API_KEY: 'tu-api-key-aqui',                // ⚠️ LLENAR
  GROQ_MODEL: 'llama-3.3-70b-versatile',

  // Supabase
  SUPABASE_URL: 'https://xxxx.supabase.co',       // ⚠️ LLENAR
  SUPABASE_SERVICE_ROLE_KEY: 'eyJxx...',          // ⚠️ LLENAR

  // Email (SMTP)
  SMTP_HOST: 'smtp.gmail.com',                    // O tu proveedor
  SMTP_PORT: '587',
  SMTP_USER: 'tu-email@gmail.com',                // ⚠️ LLENAR
  SMTP_PASS: 'app-password-aqui',                 // ⚠️ LLENAR (no contraseña normal)
  SMTP_FROM: 'Habita Peru <no-reply@habita.pe>',

  // Citas
  SLOTS_DAYS_AHEAD: '7',
  SLOT_MINUTES: '30',
  WORK_START_HOUR: '9',
  WORK_END_HOUR: '18',
  WORK_DAYS: '1,2,3,4,5,6',
  LOCAL_TZ_OFFSET_MINUTES: '-300',                // UTC-5 (Perú)
}
```

**⚠️ IMPORTANTE:**
- **GROQ_API_KEY:** Obtén en https://console.groq.com/keys
- **SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY:** Ve a https://supabase.com → Tu proyecto → Settings → API
- **SMTP:** Si usas Gmail, crea una [contraseña de aplicación](https://support.google.com/accounts/answer/185833)

### 5.3 Guardar (Ctrl+O, Enter, Ctrl+X)

---

## 🚢 Paso 6: Instalar Dependencias y Iniciar con PM2

### 6.1 Navegar al proyecto

```bash
cd /var/www/habby-chatbot
```

### 6.2 Instalar Node.js si no está (Ubuntu 22.04+)

```bash
# Agregar repositorio NodeSource
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Instalar Node.js 20 LTS
apt-get install -y nodejs

# Verificar
node --version  # Esperado: v20.x.x
npm --version   # Esperado: 10.x.x
```

### 6.3 Instalar PM2 globalmente (si no está)

```bash
npm install -g pm2
pm2 --version  # Esperado: 5.x.x+
```

### 6.4 Instalar dependencias del proyecto

```bash
npm ci --omit=dev
# o
npm install --omit=dev
```

### 6.5 Iniciar con PM2

```bash
pm2 start deploy/vps/ecosystem.config.cjs

# Ver estado
pm2 status

# Ver logs
pm2 logs habby-chatbot

# Guardar para reinicio automático en boot
pm2 save
pm2 startup

# Copiar y ejecutar el comando que aparece en la terminal
# sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root
```

---

## ✅ Paso 7: Probar Endpoints (Smoke Test)

### 7.1 Desde el servidor

```bash
cd /var/www/habby-chatbot

# Ejecutar smoke test
npm run smoke -- --base http://localhost:3000
```

**Esperado:** Todos los tests pasen ✓

```
✓ GET /api/chat
✓ GET /api/leads
✓ GET /api/appointments
✓ GET /api/availability
✓ POST /api/chat
```

### 7.2 Desde tu máquina local

```bash
npm run smoke -- --base https://tu-dominio-vps.com
```

---

## 🔍 Paso 8: Verificación Final

### 8.1 Revisar logs de Ollama

```bash
journalctl -u ollama -f
# Ctrl+C para salir
```

Esperado: Sin errores, model loaded.

### 8.2 Revisar logs de PM2

```bash
pm2 logs habby-chatbot
```

Esperado: Líneas de inicialización, sin `Error` o `ECONNREFUSED`.

### 8.3 Probar chat manualmente

```bash
curl http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "¿Qué propiedades tienes?"}
    ]
  }'
```

Esperado: Respuesta JSON con campo `response` completado.

---

## 🛑 Troubleshooting Común

### Ollama no responde en puerto 11434

```bash
# Reiniciar servicio
systemctl restart ollama

# Verificar puerto nuevamente
ss -tlnp | grep 11434

# Ver status
systemctl status ollama
```

### Chatbot no conecta a Ollama

```bash
# Verificar desde el servidor
curl http://127.0.0.1:11434/api/tags

# Si falla, revisar logs de Ollama
journalctl -u ollama -n 50
```

### PM2 no inicia el chatbot

```bash
# Ver error específico
pm2 logs habby-chatbot --err

# Verificar sintaxis de ecosystem.config.cjs
node -c deploy/vps/ecosystem.config.cjs

# Intentar arrancar en foreground para ver error
node index.js
```

### Falta memoria para modelo

```bash
# Ver uso de RAM
free -h

# Si hay poco espacio, considerar modelo más pequeño
ollama pull qwen2.5:3b-instruct   # ~2GB en lugar de 5GB
```

### SMTP no funciona

```bash
# Probar conexión SMTP
openssl s_client -connect smtp.gmail.com:587 -starttls smtp

# Verificar que has habilitado "aplicaciones menos seguras" (Gmail)
# O mejor: crear contraseña de aplicación
```

---

## 📚 Documentación Relacionada

- [Migración VPS Completa](./MIGRACION_VPS.md)
- [Configuración Nginx](./nginx-habby.conf)
- [Configuración PM2](./ecosystem.config.cjs)
- [Entrega Final - Habby Chatbot](../README_ENTREGA_FINAL.md)
- [Ollama Docs](https://ollama.com)
- [PM2 Docs](https://pm2.keymetrics.io)

---

## ✨ Resumen Final

Una vez completados estos 8 pasos, tendrás:

✅ Ollama corriendo en `127.0.0.1:11434`  
✅ Modelo `qwen2.5:7b-instruct` listo  
✅ Chatbot iniciado con PM2 en puerto 3000  
✅ Nginx reverse proxy (si aplica)  
✅ Todos los endpoints funcionales  
✅ Smoke tests pasando  
✅ Reinicio automático en boot  

**Próximo paso:** Cambiar frontend/widget de Vercel a tu dominio VPS, y mantener Groq como fallback.

---

**Consultas?** Revisa los logs del paso 8 o contacta soporte DirectAdmin/FastGlobal si hay problemas de infraestructura.

Good luck! 🚀
