const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { getLlmStatus } = require('./api/llm');
const { getPropertiesCacheMeta } = require('./api/properties');

const app = express();
const API_PREFIXES = ['/api', '/habby/api'];

function withApiPrefixes(route) {
  const clean = String(route || '').replace(/^\/+/, '');
  return API_PREFIXES.map((prefix) => `${prefix}/${clean}`.replace(/\/+/g, '/'));
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use(withApiPrefixes('chat'), require('./api/chat'));
app.use(withApiPrefixes('properties'), require('./api/properties'));
app.use(withApiPrefixes('leads'), require('./api/leads'));
app.use(withApiPrefixes('appointments'), require('./api/appointments'));
app.use(withApiPrefixes('availability'), require('./api/availability'));

app.get(withApiPrefixes('health'), (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    llm: getLlmStatus(),
    properties: getPropertiesCacheMeta(),
  });
});

app.get(['/', '/habby', '/habby/'], (req, res) => {
  const base = req.path.startsWith('/habby') ? '/habby' : '';
  const origin = `${req.protocol}://${req.get('host')}`;
  res.json({
    status: 'ok',
    service: 'Habby Chatbot — Habita Perú',
    chat: `${origin}${base}/chat-completo.html`,
    widget: `${origin}${base}/public/habby.js`,
    health: `${origin}${base}/api/health`,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Habby corriendo en puerto ${PORT}`));

module.exports = app;
