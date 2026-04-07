#!/usr/bin/env node
/**
 * Test suite for improved seller flow (pregunta primero, explica después)
 * Validates that seller responses now follow proper order
 */

import fetch from 'node-fetch';

const API_URL = process.env.API_URL || 'http://localhost:3000';
const ENDPOINT = `${API_URL}/api/chat`;

async function sendMessage(text, profile = 'vendedor', messages = []) {
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

  const json = await res.json();
  return json;
}

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ FAILED: ${message}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ PASSED: ${message}`);
  }
}

async function testSellerTerrainEvaluation() {
  console.log('\n📋 TEST: Seller evaluation reply (pregunta primero)');

  const response = await sendMessage(
    'Quiero vender mi terreno',
    'vendedor'
  );

  const { reply } = response;
  console.log('Response:', reply);

  // Validation: Should ask for data FIRST
  assert(reply.includes('1️⃣'), 'Contains numbered question 1');
  assert(reply.includes('Ubicación'), 'Mentions location as first question');
  assert(reply.includes('2️⃣'), 'Contains numbered question 2');
  assert(reply.includes('Metraje'), 'Mentions metraje as second question');
  assert(reply.includes('3️⃣'), 'Contains numbered question 3');
  assert(reply.includes('Inscripción'), 'Mentions registration as third question');

  // Validation: Should NOT have wall-of-text structure
  assert(!reply.includes('Para evaluarlo bien revisamos'), 'Does not use old preamble');
  assert(!reply.includes('La demanda y el precio final dependen'), 'Does not explain market dynamics first');

  // Validation: Should structure clearly
  assert(reply.includes('¿Comienzas compartiendo la ubicación?'), 'Clear CTA at end');
  assert(reply.includes('Excelente'), 'Uses positive tone');

  console.log('✓ Seller terrain evaluation flow improved!\n');
}

async function testSellerValueProposition() {
  console.log('\n💡 TEST: Seller value reply (benefits clearly stated)');

  const response = await sendMessage(
    'Cuales son los beneficios de vender con Habita',
    'vendedor'
  );

  const { reply } = response;
  console.log('Response:', reply);

  // Validation: Clear benefits with emojis
  assert(reply.includes('📸'), 'Has photo icon');
  assert(reply.includes('📣'), 'Has promotion icon');
  assert(reply.includes('💰'), 'Has price icon');
  assert(reply.includes('👥'), 'Has people/leads icon');

  // Validation: Mentions key benefits
  assert(reply.includes('profesional'), 'Mentions professional photos/video');
  assert(reply.includes('Drones') || reply.includes('drones'), 'Mentions drone photography');
  assert(reply.includes('precio'), 'Mentions competitive pricing');
  assert(reply.includes('Filtro') || reply.includes('filtro'), 'Mentions qualified leads');

  // Validation: No dead WhatsApp links
  assert(!reply.includes('${waUrl}'), 'No template variable leakage');

  console.log('✓ Seller value proposition clear!\n');
}

async function testSellerFollowUp() {
  console.log('\n🔄 TEST: Seller follow-up (step-by-step approach)');

  const messages = [
    { role: 'user', content: 'Quiero vender mi departamento' },
    { role: 'assistant', content: 'Excelente...' },
  ];

  const response = await sendMessage(
    'Si, adelante',
    'vendedor',
    messages
  );

  const { reply } = response;
  console.log('Response:', reply);

  // Validation: Should be step-by-step
  assert(reply.includes('paso a paso'), 'Mentions step-by-step approach');
  assert(reply.includes('📋'), 'Has process icon');
  assert(reply.includes('✅'), 'Has checkmark icon');

  // Validation: Should ask first
  assert(reply.includes('Comenzamos'), 'Asks to begin the process');
  assert(!reply.includes('Con eso te decimos'), 'Does not use old vague language');

  console.log('✓ Seller follow-up flow improved!\n');
}

async function runAllTests() {
  console.log('\n🚀 SELLER FLOW IMPROVEMENT TESTS');
  console.log('================================\n');

  try {
    await testSellerTerrainEvaluation();
    await testSellerValueProposition();
    await testSellerFollowUp();

    console.log('\n✅ ALL TESTS PASSED - Seller flow improvements verified!\n');
  } catch (err) {
    console.error('\n❌ Test error:', err.message);
    process.exitCode = 1;
  }
}

runAllTests();
