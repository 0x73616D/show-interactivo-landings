const SI_SPREADSHEET_ID = '1vYxH69oHIQi5FwWrbESupSYQHtonou97rb2Ktz9-8QQ';
const SI_TIME_ZONE = 'America/Buenos_Aires';
const SI_SECRET_PROPERTY = 'SHEETS_HMAC_SECRET';
const SI_PROCESSED_PROPERTY = 'PROCESSED_SUBMISSIONS';
const SI_MAX_PROCESSED_PROPERTY_BYTES = 8 * 1024;
const SI_MAX_MESSAGE_AGE_MS = 60 * 60 * 1000;
const SI_HEADERS = [
  'Mes', 'Fecha', 'Procedencia', 'Social o Corporativo', 'Tipo de evento',
  'Cantidad', 'Solo msj', 'Llamado', 'Zoom', 'Perdido', 'Ganado',
  'Razón / Estado Seguimiento', 'Fecha Evento + Nombre contacto',
];
const SI_MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const SI_FORM_CONFIG = {
  'contacto-sociales': {
    source: 'Formulario de Sociales',
    segment: 'Social',
    types: {
      boda: 'Boda',
      quince: 'Cumple de 15',
      adulto: 'Cumpleaños de Adultos',
      otro: 'Otro',
    },
  },
  'contacto-corporativos': {
    source: 'Formulario de Corporativo',
    segment: 'Corporativo',
    types: {
      'Fiesta de fin de año': 'Fiesta de fin de año',
      'Team Building': 'Team Building',
      Lanzamiento: 'Lanzamiento',
      'Congreso / Convención': 'Congreso / Convención',
      'Family Day': 'Family Day',
      'Show Interactivo Virtual': 'Show Interactivo Virtual',
      Otro: 'Otro',
    },
  },
};

function doPost(e) {
  try {
    if (!e || !e.postData || e.postData.length < 2 || e.postData.length > 100 * 1024) {
      return siJson_({ ok: false, error: 'Tamaño de solicitud inválido.' });
    }
    if (String(e.postData.type || '').toLowerCase().indexOf('application/json') !== 0) {
      return siJson_({ ok: false, error: 'Tipo de contenido inválido.' });
    }

    const request = JSON.parse(e && e.postData && e.postData.contents || '{}');
    const message = String(request.message || '');
    const signature = String(request.signature || '');
    const secret = PropertiesService.getScriptProperties().getProperty(SI_SECRET_PROPERTY);

    if (!secret || !message || !signature || !siValidSignature_(message, signature, secret)) {
      return siJson_({ ok: false, error: 'Firma inválida.' });
    }

    const payload = JSON.parse(message);
    siValidatePayload_(payload);

    const lock = LockService.getScriptLock();
    lock.waitLock(8 * 1000);

    try {
      const processed = siProcessedSubmissions_();
      if (processed[payload.submissionKey]) {
        return siJson_({ ok: true, duplicate: true });
      }

      const spreadsheet = SpreadsheetApp.openById(SI_SPREADSHEET_ID);
      const receivedAt = new Date(payload.receivedAt);
      const timeZone = spreadsheet.getSpreadsheetTimeZone() || SI_TIME_ZONE;
      siAssertWorkbookYear_(spreadsheet, receivedAt, timeZone);
      const sheet = siResolveMonthSheet_(spreadsheet, receivedAt, timeZone);
      siAssertHeaders_(sheet);
      const row = siInsertLead_(sheet, receivedAt, payload, timeZone);

      processed[payload.submissionKey] = Date.now();
      siSaveProcessedSubmissions_(processed);

      return siJson_({ ok: true, sheet: sheet.getName(), row: row });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    console.error(error && error.stack || error);
    return siJson_({ ok: false, error: String(error && error.message || error) });
  }
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Integración web')
    .addItem('Generar secreto', 'setupIntegration')
    .addToUi();
}

function setupIntegration() {
  const secret = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty(SI_SECRET_PROPERTY, secret);
  const html = HtmlService.createHtmlOutput(
    '<p>Copiá este valor en <strong>GOOGLE_SHEETS_HMAC_SECRET</strong> de Netlify:</p>' +
    '<input id="secret" value="' + secret + '" readonly style="width:100%;box-sizing:border-box;padding:8px">' +
    '<p><button onclick="var input=document.getElementById(\'secret\');input.select();document.execCommand(\'copy\');this.textContent=\'Copiado\'">Copiar</button></p>'
  ).setWidth(520).setHeight(170);
  SpreadsheetApp.getUi().showModalDialog(html, 'Integración Netlify → Sheets');
}

function siValidatePayload_(payload) {
  if (!payload || payload.version !== 1) throw new Error('Versión de payload inválida.');
  if (!SI_FORM_CONFIG[payload.formName]) throw new Error('Formulario no permitido.');
  if (!/^[a-zA-Z0-9-]{20,64}$/.test(String(payload.submissionKey || ''))) {
    throw new Error('Identificador de envío inválido.');
  }

  const receivedAt = new Date(payload.receivedAt);
  const age = Date.now() - receivedAt.getTime();
  if (!Number.isFinite(receivedAt.getTime()) || age > SI_MAX_MESSAGE_AGE_MS || age < -5 * 60 * 1000) {
    throw new Error('La fecha de recepción es inválida o expiró.');
  }
}

function siValidSignature_(message, signature, secret) {
  const bytes = Utilities.computeHmacSha256Signature(message, secret, Utilities.Charset.UTF_8);
  const expected = Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
  const actual = signature.replace(/=+$/, '');
  if (expected.length !== actual.length) return false;

  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }
  return difference === 0;
}

function siResolveMonthSheet_(spreadsheet, receivedAt, timeZone) {
  const monthNumber = Number(Utilities.formatDate(receivedAt, timeZone, 'M'));
  const monthName = SI_MONTHS[monthNumber - 1];
  const normalizedMonth = siNormalize_(monthName);

  const existing = spreadsheet.getSheets().find(function(sheet) {
    return siNormalize_(sheet.getName().replace(/^\d{2}-/, '')) === normalizedMonth;
  });
  if (existing) return existing;

  const source = spreadsheet.getSheets()
    .filter(function(sheet) {
      return SI_MONTHS.some(function(month) {
        return siNormalize_(sheet.getName().replace(/^\d{2}-/, '')) === siNormalize_(month);
      });
    })
    .pop();

  if (!source) throw new Error('No existe una pestaña mensual para usar como modelo.');

  const name = String(monthNumber).padStart(2, '0') + '-' + monthName;
  const sheet = source.copyTo(spreadsheet).setName(name);
  if (sheet.getMaxRows() > 1) {
    // Conserva bordes, tipografías, formatos numéricos y validaciones del
    // modelo mensual. Sólo se vacía la tabla A:M; cualquier columna auxiliar
    // o fórmula que el equipo agregue a la plantilla queda intacta.
    sheet.getRange(2, 1, sheet.getMaxRows() - 1, SI_HEADERS.length).clearContent();
  }
  sheet.setFrozenRows(1);
  return sheet;
}

function siInsertLead_(sheet, receivedAt, payload, timeZone) {
  const config = SI_FORM_CONFIG[payload.formName];
  const fields = payload.fields || {};
  const rowTwoIsEmpty = sheet.getRange(2, 1, 1, 13).isBlank();
  if (!rowTwoIsEmpty) {
    sheet.insertRowsBefore(2, 1);
  }

  // Si el mes todavía está vacío, busca una fila real del mes anterior. Así
  // el primer lead también hereda bordes, tipografías, validaciones y altura.
  const template = siFindTemplateRow_(sheet.getParent(), sheet);
  if (template) {
    const sourceRange = template.sheet.getRange(template.row, 1, 1, SI_HEADERS.length);
    const targetRange = sheet.getRange(2, 1, 1, SI_HEADERS.length);
    sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    sourceRange.copyTo(targetRange, SpreadsheetApp.CopyPasteType.PASTE_DATA_VALIDATION, false);
    sheet.setRowHeight(2, template.sheet.getRowHeight(template.row));
  }

  const monthNumber = Number(Utilities.formatDate(receivedAt, timeZone, 'M'));
  const year = Number(Utilities.formatDate(receivedAt, timeZone, 'yyyy'));
  const day = Number(Utilities.formatDate(receivedAt, timeZone, 'd'));
  const monthDate = Utilities.parseDate(
    year + '-' + String(monthNumber).padStart(2, '0') + '-01 12:00:00',
    timeZone,
    'yyyy-MM-dd HH:mm:ss',
  );
  const type = config.types[String(fields.tipo || '')] || 'Otro';

  const values = [[
    monthDate,
    day,
    config.source,
    config.segment,
    type,
    1,
    '', '', '', '', '', '',
    siContactSummary_(fields),
  ]];

  const range = sheet.getRange(2, 1, 1, 13);
  range.setValues(values);
  range.setBackground('#ffff00');
  sheet.getRange(2, 1).setNumberFormat('mmmm yyyy');
  sheet.getRange(2, 1, 1, 2).setHorizontalAlignment('left');
  sheet.getRange(2, 13).setWrap(true);
  return 2;
}

function siFindTemplateRow_(spreadsheet, targetSheet) {
  const candidates = [targetSheet].concat(
    spreadsheet.getSheets()
      .filter(function(sheet) {
        return sheet.getSheetId() !== targetSheet.getSheetId() && siIsMonthSheet_(sheet);
      })
      .reverse(),
  );

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const lastRow = candidate.getLastRow();
    if (lastRow < 2) continue;

    const rows = candidate.getRange(2, 1, lastRow - 1, SI_HEADERS.length).getDisplayValues();
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      if (rows[rowIndex].some(function(value) { return String(value || '').trim(); })) {
        return { sheet: candidate, row: rowIndex + 2 };
      }
    }
  }

  return null;
}

function siIsMonthSheet_(sheet) {
  const normalizedName = siNormalize_(sheet.getName().replace(/^\d{2}-/, ''));
  return SI_MONTHS.some(function(month) {
    return normalizedName === siNormalize_(month);
  });
}

function siAssertHeaders_(sheet) {
  const headers = sheet.getRange(1, 1, 1, 13).getDisplayValues()[0]
    .map(function(value) { return String(value || '').trim(); });
  if (JSON.stringify(headers) !== JSON.stringify(SI_HEADERS)) {
    throw new Error('La pestaña ' + sheet.getName() + ' no conserva el encabezado A:M esperado.');
  }
}

function siAssertWorkbookYear_(spreadsheet, receivedAt, timeZone) {
  const match = spreadsheet.getName().match(/\b(20\d{2})\b/);
  if (!match) return;
  const receivedYear = Utilities.formatDate(receivedAt, timeZone, 'yyyy');
  if (match[1] !== receivedYear) {
    throw new Error('La planilla corresponde a ' + match[1] + ' y la consulta a ' + receivedYear + '.');
  }
}

function siContactSummary_(fields) {
  const parts = [
    ['Fecha evento', fields.fecha],
    ['Nombre', fields.nombre],
    ['Empresa', fields.empresa],
    ['Localidad', fields.localidad],
    ['Invitados', fields.invitados],
    ['Email', fields.email],
    ['Teléfono', fields.telefono],
    ['Mensaje', fields.mensaje],
  ];

  return parts
    .filter(function(part) { return String(part[1] || '').trim(); })
    .map(function(part) {
      return part[0] + ': ' + String(part[1]).replace(/[\u0000-\u001F\u007F]/g, ' ').trim();
    })
    .join(' | ')
    .slice(0, 20 * 1000);
}

function siProcessedSubmissions_() {
  const raw = PropertiesService.getScriptProperties().getProperty(SI_PROCESSED_PROPERTY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    return {};
  }
}

function siSaveProcessedSubmissions_(processed) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const recent = Object.entries(processed)
    .filter(function(entry) { return Number(entry[1]) >= cutoff; })
    .sort(function(a, b) { return Number(b[1]) - Number(a[1]); })
    .slice(0, 100);

  let serialized = JSON.stringify(Object.fromEntries(recent));
  while (recent.length && serialized.length > SI_MAX_PROCESSED_PROPERTY_BYTES) {
    recent.pop();
    serialized = JSON.stringify(Object.fromEntries(recent));
  }

  PropertiesService.getScriptProperties().setProperty(SI_PROCESSED_PROPERTY, serialized);
}

function siNormalize_(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function siJson_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
