const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/chat',       require('./api/chat'));
app.use('/api/properties', require('./api/properties'));

app.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'Habby Chatbot — Habita Perú',
    widget: `${req.protocol}://${req.get('host')}/habby.js`,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Habby corriendo en puerto ${PORT}`));

module.exports = app;
