import { createHash, randomUUID } from 'node:crypto';
import { getStore } from '@netlify/blobs';

// Same ingestion endpoint and event schema as HighLevel's external-tracking SDK.
// Only Netlify's signed, verified form event may reach this handler.
const TRACKING_ID = 'tk_43d307e3f5ed42c3936957f269284198';
const TRACKING_ENDPOINT = 'https://backend.leadconnectorhq.com/external-tracking/events';
const SITE_ORIGIN = 'https://showinteractivo.com';
const FORMS = {
  'contacto-corporativos': { section: '/eventos-corporativos/', title: 'Show Interactivo Corporativos' },
  'contacto-sociales': { section: '/eventos-sociales/', title: 'Show Interactivo Sociales' },
};
const ATTRIBUTION_FIELDS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gbraid', 'wbraid'];
const clean = (value, limit = 4000) => String(value ?? '').trim().slice(0, limit);
const uuid = (value) => /^[a-f\d]{8}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{4}-[a-f\d]{12}$/i.test(value);

function eventDate(value) {
  const text = clean(value, 30);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const match = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (!match) return '';
  const iso = `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isFinite(parsed.valueOf()) && parsed.toISOString().startsWith(iso) ? iso : '';
}

export function buildConfirmedEvent(data, now = Date.now()) {
  const formName = clean(data?.integration_form, 80);
  const config = FORMS[formName];
  // Cached, older pages still use the old browser tracker. Never send a second
  // server notification for those submissions during the deployment transition.
  if (!config || data.notification_version !== '2') return null;
  const submissionKey = clean(data.submission_key, 64);
  if (!/^[a-zA-Z0-9-]{20,64}$/.test(submissionKey)) throw new Error('Missing consultation identifier');
  const required = ['nombre', 'email', 'telefono', 'tipo', 'localidad', 'invitados'];
  if (formName === 'contacto-corporativos') required.push('empresa');
  if (required.some((key) => !clean(data[key])) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(data.email))) {
    throw new Error(`Incomplete verified consultation: ${submissionKey}`);
  }
  const sessionId = uuid(clean(data.tracking_session_id)) ? data.tracking_session_id : (uuid(submissionKey) ? submissionKey : randomUUID());
  const path = clean(data.landing_path, 300);
  const url = new URL(path.startsWith(config.section) && !path.includes('..') ? path : config.section, SITE_ORIGIN);
  for (const field of ATTRIBUTION_FIELDS) if (clean(data[field], 1000)) url.searchParams.set(field, clean(data[field], 1000));
  const values = {
    full_name: clean(data.nombre, 200),
    email: clean(data.email, 320),
    phone: clean(data.telefono, 60),
    tipo_de_evento: clean(data.tipo, 200),
    fecha_del_evento: eventDate(data.fecha),
    localidad: clean(data.localidad, 200),
    cantidad_de_invitados: clean(data.invitados, 100),
    mensaje: clean(data.mensaje),
    origen_de_la_consulta: clean(data.origen_de_la_consulta, 200),
    ...Object.fromEntries(ATTRIBUTION_FIELDS.map((key) => [key, clean(data[key], 1000)])),
    Timezone: clean(data.tracking_timezone, 100) || 'America/Argentina/Buenos_Aires',
  };
  if (formName === 'contacto-corporativos') values.nombre_de_la_empresa = clean(data.empresa, 300);
  const labels = {
    full_name: 'Full Name', email: 'Email', phone: 'Phone',
    nombre_de_la_empresa: 'Nombre de la empresa', tipo_de_evento: 'TIPO DE EVENTO',
    fecha_del_evento: 'FECHA DEL EVENTO', localidad: 'LOCALIDAD',
    cantidad_de_invitados: 'CANTIDAD DE INVITADOS', mensaje: 'MENSAJE:',
    origen_de_la_consulta: 'Origen de la consulta',
    utm_source: 'UTM Source', utm_medium: 'UTM Medium', utm_campaign: 'UTM Campaign',
    utm_content: 'UTM Content', utm_term: 'UTM Term',
    gclid: 'Google Click ID (GCLID)', fbclid: 'Facebook Click ID', gbraid: 'GBRAID', wbraid: 'WBRAID',
  };
  const deviceType = ['desktop', 'mobile', 'tablet'].includes(data.tracking_device_type) ? data.tracking_device_type : 'desktop';
  return {
    key: createHash('sha256').update(`${formName}:${submissionKey}`).digest('hex'),
    submissionKey,
    event: {
      type: 'external_form_submission', trackingId: TRACKING_ID, sessionId,
      timestamp: now, formId: formName, formData: values, formLabels: labels,
      formFieldMetadata: Object.keys(values).map((key) => ({
        formField: key, label: labels[key] || key,
        inputType: key === 'phone' ? 'tel' : key === 'email' ? 'email' : key === 'fecha_del_evento' ? 'date' : 'text',
        required: ['full_name', 'email', 'phone', 'tipo_de_evento', 'localidad', 'cantidad_de_invitados'].includes(key),
      })),
      title: config.title, url: url.href, path: url.pathname,
      referrer: clean(data.referrer, 2000),
      properties: { sessionId, deviceType, submissionKey, confirmedBy: 'netlify-verified-form' },
    },
  };
}

export async function notifyConfirmedConsultation(data, { store, send = fetch, now = Date.now } = {}) {
  const confirmed = buildConfirmedEvent(data, now());
  if (!confirmed) return { status: 'ignored' };
  const ledger = store || getStore({ name: 'confirmed-consultation-notifications', consistency: 'strong' });
  const claimId = randomUUID();
  const record = { claimId, submissionKey: confirmed.submissionKey, state: 'sending', claimedAt: new Date(now()).toISOString() };
  const claim = await ledger.setJSON(confirmed.key, record, { onlyIfNew: true });
  if (!claim.modified) return { status: 'duplicate' };
  // Confirm the conditional write before contacting the downstream service.
  // A storage failure must never accidentally bypass duplicate protection.
  const saved = await ledger.get(confirmed.key, { type: 'json', consistency: 'strong' });
  if (saved?.claimId !== claimId) throw new Error('Could not confirm notification claim');
  try {
    const response = await send(TRACKING_ENDPOINT, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(confirmed.event), signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`HighLevel returned HTTP ${response.status}`);
    await ledger.setJSON(confirmed.key, { ...record, state: 'delivered', deliveredAt: new Date(now()).toISOString() });
    return { status: 'delivered' };
  } catch (error) {
    // Keep the claim: a lost acknowledgement may mean GHL already accepted the
    // event. Replaying automatically could send the very duplicate we prevent.
    await ledger.setJSON(confirmed.key, { ...record, state: 'needs-review', error: clean(error.message, 300) }).catch(() => {});
    console.error(`Confirmed notification needs review: ${confirmed.submissionKey}`, error.message);
    throw error;
  }
}

export default {
  async formSubmitted(event) {
    const result = await notifyConfirmedConsultation(event.data);
    console.log(`Confirmed consultation notification: ${result.status}`);
  },
};
