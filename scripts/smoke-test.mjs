#!/usr/bin/env node

const args = process.argv.slice(2);
const baseArgIndex = args.findIndex((a) => a === '--base');
const base = baseArgIndex >= 0 && args[baseArgIndex + 1]
  ? args[baseArgIndex + 1].replace(/\/$/, '')
  : (args[0] && !args[0].startsWith('--')
      ? args[0].replace(/\/$/, '')
      : 'http://localhost:3000');

const endpoints = [
  '/api/chat',
  '/api/leads',
  '/api/appointments',
  '/api/availability',
];

async function check(url) {
  const res = await fetch(url, { method: 'GET' });
  const text = await res.text();
  return { ok: res.ok, status: res.status, body: text.slice(0, 220) };
}

(async () => {
  console.log(`Smoke test base: ${base}`);
  let failed = 0;

  for (const ep of endpoints) {
    const url = `${base}${ep}`;
    try {
      const r = await check(url);
      if (!r.ok) {
        failed += 1;
        console.log(`❌ ${ep} -> ${r.status}`);
        console.log(`   ${r.body}`);
      } else {
        console.log(`✅ ${ep} -> ${r.status}`);
      }
    } catch (err) {
      failed += 1;
      console.log(`❌ ${ep} -> ERROR ${err.message}`);
    }
  }

  if (failed > 0) {
    console.log(`\nResultado: ${failed} endpoint(s) con falla.`);
    process.exit(1);
  }

  console.log('\nResultado: todo OK.');
})();
