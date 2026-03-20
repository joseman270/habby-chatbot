const express = require('express');
const cors    = require('cors');
const path    = require('path');
const { getLlmStatus } = require('./api/llm');
const { getPropertiesCacheMeta } = require('./api/properties');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/chat',       require('./api/chat'));
app.use('/api/properties', require('./api/properties'));
app.use('/api/leads',      require('./api/leads'));
app.use('/api/appointments', require('./api/appointments'));
app.use('/api/availability', require('./api/availability'));

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    llm: getLlmStatus(),
    properties: getPropertiesCacheMeta(),
  });
});

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Habby Chatbot — Habita Perú',
    widget: `${req.protocol}://${req.get('host')}/habby.js`,
    health: `${req.protocol}://${req.get('host')}/api/health`,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Habby corriendo en puerto ${PORT}`));

module.exports = app;
