import { createHmac } from 'node:crypto';

const WEBHOOK_URL_ENV = 'GOOGLE_SHEETS_WEBHOOK_URL';
const WEBHOOK_SECRET_ENV = 'GOOGLE_SHEETS_HMAC_SECRET';
const REQUEST_TIMEOUT_MS = 30_000;

const FORM_FIELDS = {
  'contacto-sociales': ['nombre', 'tipo', 'fecha', 'email', 'telefono', 'localidad', 'invitados', 'mensaje'],
  'contacto-corporativos': ['nombre', 'empresa', 'email', 'telefono', 'tipo', 'fecha', 'localidad', 'invitados', 'mensaje'],
};

function clean(value, maxLength = 4_000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLength);
}

function allowedFields(formName, data) {
  return Object.fromEntries(
    FORM_FIELDS[formName].map((field) => [field, clean(data[field])]),
  );
}

function sign(message, secret) {
  return createHmac('sha256', secret).update(message, 'utf8').digest('base64url');
}

function resolveFormName(data) {
  const explicitName = clean(data?.integration_form || data?.['form-name'], 80);
  if (FORM_FIELDS[explicitName]) return explicitName;

  // Netlify usa `form-name` para enrutar el envío, pero no lo incluye en
  // `FormSubmittedEvent.data`. Este fallback mantiene compatibles los envíos
  // realizados antes de agregar `integration_form` a los formularios.
  if (data && Object.prototype.hasOwnProperty.call(data, 'empresa')) {
    return 'contacto-corporativos';
  }

  return data?.submission_key ? 'contacto-sociales' : '';
}

export function buildSheetsEnvelope(data, receivedAt = new Date()) {
  const formName = resolveFormName(data);
  if (!FORM_FIELDS[formName]) return null;

  const submissionKey = clean(data?.submission_key);
  if (!/^[a-zA-Z0-9-]{20,64}$/.test(submissionKey)) {
    throw new Error(`El formulario ${formName} no incluyó una submission_key válida.`);
  }

  return {
    version: 1,
    submissionKey,
    receivedAt: receivedAt.toISOString(),
    formName,
    fields: allowedFields(formName, data),
  };
}

export default {
  async formSubmitted(event) {
    const envelope = buildSheetsEnvelope(event.data);
    if (!envelope) return;

    const webhookUrl = process.env[WEBHOOK_URL_ENV];
    const webhookSecret = process.env[WEBHOOK_SECRET_ENV];

    // Netlify Forms conserva la consulta aunque todavía no se hayan configurado
    // las credenciales de la sincronización.
    if (!webhookUrl || !webhookSecret) {
      console.warn(`Sincronización omitida: faltan ${WEBHOOK_URL_ENV} y/o ${WEBHOOK_SECRET_ENV}.`);
      return;
    }

    const message = JSON.stringify(envelope);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ message, signature: sign(message, webhookSecret) }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Google Sheets respondió HTTP ${response.status}.`);
      }

      const result = await response.json();
      if (result?.ok !== true) {
        throw new Error(`Google Sheets rechazó la consulta: ${clean(result?.error, 300) || 'respuesta inválida'}.`);
      }
    } catch (error) {
      console.error(`No se pudo sincronizar ${envelope.submissionKey}:`, error);
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  },
};
