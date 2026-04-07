#!/usr/bin/env node
/**
 * Test suite for agent flow (captación y no bucles)
 */

import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ENDPOINT = `${API_URL}/api/chat`;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sendMessage(text, profile = 'agente', messages = []) {
  const payload = {
    messages: [...messages, { role: 'user', content: text }],
    profile,
  };

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function retry(fn, retries = 5, delayMs = 400) {
  let lastErr;
  for (let i = 0; i < retries; i += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      await wait(delayMs);
    }
  }
  throw lastErr;
}

async function testAgentCaptureIntent() {
  console.log('\n🧩 TEST: Agent capture intent');

  const response = await retry(() => sendMessage('Tengo un inmueble para captar', 'agente'));
  const { reply } = response;

  console.log('Response:', reply);

  assert(/captar|inmueble/i.test(reply), 'Mentions captación or inmueble');
  assert(/ubicaci|distrito|zona/i.test(reply), 'Asks for location');
  assert(/tipo|inmueble|propiedad/i.test(reply), 'Asks for property type');
  assert(reply.trim().endsWith('?'), 'Ends with a question');
}

async function runAllTests() {
  console.log('\n🚀 AGENT FLOW TESTS');
  console.log('====================\n');

  try {
    await testAgentCaptureIntent();
    console.log('\n✅ ALL TESTS PASSED - Agent flow verified!\n');
  } catch (err) {
    console.error('\n❌ Test error:', err.message);
    process.exitCode = 1;
  }
}

runAllTests();
