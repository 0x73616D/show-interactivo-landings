(() => {
  const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gbraid', 'wbraid'];
  const params = new URLSearchParams(location.search);
  let attribution = {};
  try { attribution = JSON.parse(sessionStorage.getItem('si_form_attribution') || '{}'); } catch {}
  if (fields.some(key => params.has(key))) {
    attribution = Object.fromEntries(fields.map(key => [key, params.get(key) || '']));
  }
  attribution.referrer ||= document.referrer;
  // Keep the same acquisition session when the confirmation page returns to the landing.
  let internalNavigation = false;
  try { internalNavigation = new URL(document.referrer).origin === location.origin; } catch {}
  if (!fields.some(key => params.has(key)) && internalNavigation) {
    for (const key of fields) if (attribution[key]) params.set(key, attribution[key]);
    if (params.size) history.replaceState({}, '', location.pathname + '?' + params.toString() + location.hash);
  }
  try { sessionStorage.setItem('si_form_attribution', JSON.stringify(attribution)); } catch {}
  const source = (attribution.utm_source || '').toLowerCase();
  const medium = (attribution.utm_medium || '').toLowerCase();
  const paid = /cpc|ppc|paid|ads/.test(medium);
  let origin = 'Directo';
  if (attribution.gclid || attribution.gbraid || attribution.wbraid) origin = 'Google Ads';
  else if (/google/.test(source)) origin = paid ? 'Google Ads' : 'Google';
  else if (/meta|facebook|instagram|^fb$|^ig$/.test(source) || attribution.fbclid) origin = paid ? 'Meta Ads' : 'Meta';
  else if (source) origin = attribution.utm_source;
  else {
    try {
      const ref = new URL(attribution.referrer);
      if (ref.origin !== location.origin) origin = /google\./.test(ref.hostname) ? 'Google orgánico' : /bing\./.test(ref.hostname) ? 'Bing orgánico' : 'Referido: ' + ref.hostname;
    } catch {}
  }
  document.querySelectorAll('form[name="contacto-corporativos"], form[name="contacto-sociales"]').forEach(form => {
    const syncContactFields = () => {
      const set = (key, value) => { const input = form.querySelector(`input[name="${key}"]`); if (input) input.value = value; };
      set('origen_de_la_consulta', origin);
      set('full_name', form.querySelector('[name="nombre"]')?.value || '');
      set('nombre_de_la_empresa', form.querySelector('[name="empresa"]')?.value || '');
      const date = form.querySelector('[name="fecha"]')?.value || '';
      const match = date.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
      set('fecha_del_evento', match ? `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}` : date);
    };
    form.addEventListener('input', syncContactFields);
    form.addEventListener('change', syncContactFields);
    form.addEventListener('submit', syncContactFields, true);
    syncContactFields();
    for (const key of [...fields, 'referrer']) {
      const input = form.querySelector(`input[name="${key}"]`);
      if (!input) continue;
      input.value = attribution[key] || '';
    }
  });
})();
