import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConfirmedEvent, notifyConfirmedConsultation } from '../netlify/functions/notify-confirmed-consultation.mjs';

const consultation = (overrides = {}) => ({
  integration_form: 'contacto-sociales', notification_version: '2',
  submission_key: '41f3d352-4145-4cd1-8129-d049b500267e',
  nombre: 'Prueba integración', email: 'admin+prueba@broadmkt.com', telefono: '1100000090',
  tipo: 'boda', fecha: '30/10/2026', localidad: 'Córdoba', invitados: '50-100',
  mensaje: 'Prueba técnica', landing_path: '/eventos-sociales/bodas/',
  utm_source: 'meta', utm_campaign: 'validacion', origen_de_la_consulta: 'Meta Ads',
  ...overrides,
});
const ledger = () => {
  const entries = new Map();
  return {
    entries,
    async setJSON(key, value, { onlyIfNew } = {}) {
      if (onlyIfNew && entries.has(key)) return { modified: false };
      entries.set(key, structuredClone(value));
      return { modified: true };
    },
    async get(key) { return entries.get(key) || null; },
  };
};

test('ignores old cached pages and forms outside this integration', async () => {
  let sent = 0;
  const dependencies = { store: ledger(), send: async () => { sent++; return { ok: true }; } };
  assert.equal((await notifyConfirmedConsultation(consultation({ notification_version: '' }), dependencies)).status, 'ignored');
  assert.equal(buildConfirmedEvent(consultation({ integration_form: 'another-form' })), null);
  assert.equal(sent, 0);
});

test('rejects incomplete data before claiming or sending a notification', async () => {
  const store = ledger();
  let sent = 0;
  for (const field of ['nombre', 'email', 'telefono', 'tipo', 'localidad', 'invitados']) {
    await assert.rejects(notifyConfirmedConsultation(consultation({ [field]: ' ' }), {
      store, send: async () => { sent++; return { ok: true }; },
    }), /Incomplete/);
  }
  assert.equal(store.entries.size, 0);
  assert.equal(sent, 0);
});

test('eight concurrent deliveries and a later replay send exactly one GHL event', async () => {
  const store = ledger();
  let sent = 0;
  const send = async () => { sent++; await new Promise(resolve => setTimeout(resolve, 5)); return { ok: true }; };
  const results = await Promise.all(Array.from({ length: 8 }, () => notifyConfirmedConsultation(consultation(), { store, send })));
  assert.equal(results.filter(result => result.status === 'delivered').length, 1);
  assert.equal(results.filter(result => result.status === 'duplicate').length, 7);
  assert.equal((await notifyConfirmedConsultation(consultation(), { store, send })).status, 'duplicate');
  assert.equal(sent, 1);
  assert.equal([...store.entries.values()][0].state, 'delivered');
});

test('a genuinely new consultation and another business unit are not suppressed', async () => {
  const store = ledger();
  let sent = 0;
  const send = async () => { sent++; return { ok: true }; };
  await notifyConfirmedConsultation(consultation(), { store, send });
  await notifyConfirmedConsultation(consultation({ submission_key: '2b379972-e357-46de-9ea9-b483a62cc94e' }), { store, send });
  await notifyConfirmedConsultation(consultation({ integration_form: 'contacto-corporativos', empresa: 'Prueba' }), { store, send });
  assert.equal(sent, 3);
});

test('a storage failure prevents contacting GHL', async () => {
  let sent = 0;
  await assert.rejects(notifyConfirmedConsultation(consultation(), {
    store: { async setJSON() { throw new Error('Storage unavailable'); } },
    send: async () => { sent++; return { ok: true }; },
  }), /Storage unavailable/);
  assert.equal(sent, 0);
});

test('a missing write acknowledgement cannot bypass the deduplication ledger', async () => {
  let sent = 0;
  await assert.rejects(notifyConfirmedConsultation(consultation(), {
    store: { async setJSON() { return { modified: true }; }, async get() { return null; } },
    send: async () => { sent++; return { ok: true }; },
  }), /confirm notification claim/);
  assert.equal(sent, 0);
});

test('an ambiguous remote failure is kept for review instead of sending twice', async () => {
  const store = ledger();
  let sent = 0;
  const send = async () => { sent++; throw new Error('Response lost after upstream accepted request'); };
  await assert.rejects(notifyConfirmedConsultation(consultation(), { store, send }), /Response lost/);
  assert.equal((await notifyConfirmedConsultation(consultation(), { store, send })).status, 'duplicate');
  assert.equal(sent, 1);
  assert.equal([...store.entries.values()][0].state, 'needs-review');
});

test('canonical CRM fields and acquisition metadata survive the server handoff', () => {
  const payload = buildConfirmedEvent(consultation({
    integration_form: 'contacto-corporativos', empresa: 'Empresa prueba',
    landing_path: 'https://untrusted.example/', gclid: 'sample-click',
    tracking_session_id: '655c8718-0230-4f9a-9346-229b52615611',
  })).event;
  assert.equal(payload.formId, 'contacto-corporativos');
  assert.equal(payload.formData.full_name, 'Prueba integración');
  assert.equal(payload.formData.phone, '1100000090');
  assert.equal(payload.formData.nombre_de_la_empresa, 'Empresa prueba');
  assert.equal(payload.formData.fecha_del_evento, '2026-10-30');
  assert.equal(payload.formData.origen_de_la_consulta, 'Meta Ads');
  assert.equal(payload.formData.utm_campaign, 'validacion');
  assert.equal(new URL(payload.url).origin, 'https://showinteractivo.com');
  assert.equal(new URL(payload.url).searchParams.get('gclid'), 'sample-click');
  assert.equal(payload.properties.sessionId, payload.sessionId);
});
