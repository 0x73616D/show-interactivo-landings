(() => {
  const fields = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'fbclid', 'gbraid', 'wbraid'];
  const params = new URLSearchParams(location.search);
  let attribution = {};
  try { attribution = JSON.parse(sessionStorage.getItem('si_form_attribution') || '{}'); } catch {}
  if (fields.some(key => params.has(key))) {
    attribution = Object.fromEntries(fields.map(key => [key, params.get(key) || '']));
  }
  attribution.referrer ||= document.referrer;
  try { sessionStorage.setItem('si_form_attribution', JSON.stringify(attribution)); } catch {}
  document.querySelectorAll('form[data-netlify]').forEach(form => {
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
