# Habby Chatbot — App independiente en Vercel

## Estructura
```
habby-app/
├── api/
│   ├── chat.js          ← POST /api/chat (proxy a Claude)
│   └── properties.js    ← GET /api/properties (lee WP REST API)
├── public/
│   └── habby.js         ← Widget que se incrusta en WordPress
├── index.js             ← Servidor Express
├── vercel.json          ← Rutas
└── package.json
```

---

## 1. Variables de entorno en Vercel

Ve a: **Vercel → tu proyecto → Settings → Environment Variables**

| Variable | Valor |
|---|---|
| `GROQ_API_KEY` | Tu clave de console.groq.com |
| `WP_URL` | `https://habita.pe` |
| `WHATSAPP_NUMBER` | `51987654321` (sin +) |
| `MAX_PROPERTIES` | `20` |

Después de guardar → **Redeploy**.

---

## 2. Incrustar en WordPress

En el panel de WordPress ve a:
**Apariencia → Editor de temas → footer.php**

Añade ANTES de `</body>`:

```html
<script src="https://habby-chatbot.vercel.app/habby.js"></script>
```

O si usas un plugin de "Insert Headers and Footers", pégalo ahí directamente.

---

## 3. Dominio personalizado (chat.habita.pe)

1. Ve a **Vercel → tu proyecto → Settings → Domains**
2. Añade `chat.habita.pe`
3. En el panel DNS de tu dominio añade:
   ```
   chat   CNAME   cname.vercel-dns.com
   ```
4. Espera 5-10 minutos y listo

Luego actualiza la línea del script en WordPress:
```html
<script src="https://chat.habita.pe/habby.js"></script>
```

---

## 4. Verificar que todo funciona

- `https://habby-chatbot.vercel.app/` → debe mostrar JSON con status "ok"
- `https://habby-chatbot.vercel.app/api/properties` → debe listar los inmuebles
- `https://habby-chatbot.vercel.app/habby.js` → debe devolver el widget JS

---

## Personalizar colores

Edita `public/habby.js`, líneas al inicio:
```js
const PRIMARY    = '#1B4FD8';   // Color principal
const PRIMARY_DK = '#1540B8';   // Hover
```

Cambia por los colores de Habita y haz push al repo.
