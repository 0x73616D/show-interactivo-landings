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
    for (const key of [...fields, 'referrer']) {
      const input = form.querySelector(`input[name="${key}"]`);
      if (!input) continue;
      input.value = attribution[key] || '';
    }
  });
})();
