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
  document.querySelectorAll('form[name="contacto-corporativos"], form[name="contacto-sociales"]').forEach(form => {
    const syncContactFields = () => {
      const set = (key, value) => { const input = form.querySelector(`input[name="${key}"]`); if (input) input.value = value; };
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
