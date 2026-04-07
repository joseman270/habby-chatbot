#!/usr/bin/env node
import fetch from 'node-fetch';

const query = 'Busco departamento en Cusco';
const responses = [];
const messages_history = [];

async function sendMessage(text, messages) {
  const res = await fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, profile: 'comprador' }),
  });
  const json = await res.json();
  return json.reply;
}

console.log('\n🔄 LOOP TEST - Same query 3 times\n');
console.log(`Query: "${query}"\n`);

for (let i = 1; i <= 3; i++) {
  const messages = [...messages_history, { role: 'user', content: query }];
  
  const reply = await sendMessage(query, messages);
  responses.push(reply);
  
  // Add to history for next turn
  messages_history.push({ role: 'user', content: query });
  messages_history.push({ role: 'assistant', content: reply });
  
  console.log(`Turn ${i}:`);
  console.log(`${reply.substring(0, 80)}...`);
  console.log(`[Provider: rule-based/LLM]`);
  console.log('');
}

// Check for duplicates
const normalize = (s) => s.replace(/[^\w]/g, '').toLowerCase();
const p1 = normalize(responses[0]);
const p2 = normalize(responses[1]);
const p3 = normalize(responses[2]);

console.log('📊 ANALYSIS:');
console.log(`Turn 1 == Turn 2? ${p1 === p2 ? '❌ LOOP!' : '✅ Different'}`);
console.log(`Turn 2 == Turn 3? ${p2 === p3 ? '❌ LOOP!' : '✅ Different'}`);
console.log(`All different? ${p1 !== p2 && p2 !== p3 ? '✅ RESOLVED!' : '⚠️ Still has loops'}`);

process.exit(0);
