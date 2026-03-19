const fs   = require('fs');
const path = require('path');

module.exports = (req, res) => {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');
  res.setHeader('Access-Control-Allow-Origin', '*');

  const file = path.join(__dirname, '..', 'public', 'habby.js');
  try {
    const content = fs.readFileSync(file, 'utf8');
    res.status(200).send(content);
  } catch (err) {
    res.status(500).send('// Error cargando widget: ' + err.message);
  }
};
