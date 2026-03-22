const { getLlmStatus } = require('./llm');
const { getPropertiesCacheMeta } = require('./properties');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Metodo no permitido.' });
  }

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    llm: getLlmStatus(),
    properties: getPropertiesCacheMeta(),
  });
};
