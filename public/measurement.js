(() => {
  if (window.__showInteractiveMeasurementLoaded) return;
  window.__showInteractiveMeasurementLoaded = true;
  window.dataLayer = window.dataLayer || [];

  const allowedEventTypes = new Set([
    'boda',
    'cumple_15',
    'cumple_adultos',
    'fiesta_fin_ano',
    'team_building',
    'otros_corporativos',
    'sin_clasificar',
  ]);
  const leadForms = new Set(['contacto-sociales', 'contacto-corporativos']);
  const markerPrefix = 'show-interactivo:pending-lead:';
  const markerLifetimeMs = 15 * 60 * 1000;

  const eventType = (value) => allowedEventTypes.has(value) ? value : 'sin_clasificar';
  const markerKey = (formName) => `${markerPrefix}${formName}`;

  const setEventContext = (type, landingPath = window.location.pathname) => {
    const normalizedType = eventType(type);
    if (document.body) document.body.dataset.eventType = normalizedType;

    document.querySelectorAll('input[name="event_type"]').forEach((input) => {
      input.value = normalizedType;
    });
    document.querySelectorAll('input[name="landing_path"]').forEach((input) => {
      input.value = landingPath;
    });
  };

  window.ShowInteractiveMeasurement = { setEventContext };

  document.addEventListener('click', (clickEvent) => {
    if (!(clickEvent.target instanceof Element)) return;
    const link = clickEvent.target.closest(
      'a[href^="https://wa.me/"],a[href^="http://wa.me/"],a[href^="https://api.whatsapp.com/"]',
    );
    if (!link) return;

    window.dataLayer.push({
      event: 'click_whatsapp',
      event_type: eventType(document.body?.dataset.eventType),
      page_path: window.location.pathname,
    });
  }, true);

  document.addEventListener('submit', (submitEvent) => {
    const form = submitEvent.target;
    if (!(form instanceof HTMLFormElement) || !leadForms.has(form.name)) return;
    if (!form.checkValidity()) return;

    const typeInput = form.elements.namedItem('event_type');
    const pathInput = form.elements.namedItem('landing_path');
    const submissionInput = form.elements.namedItem('submission_key');
    const pendingLead = {
      formName: form.name,
      eventType: eventType(typeInput?.value || document.body?.dataset.eventType),
      sourcePage: pathInput?.value || window.location.pathname,
      submissionKey: submissionInput?.value || '',
      createdAt: Date.now(),
    };

    try {
      sessionStorage.setItem(markerKey(form.name), JSON.stringify(pendingLead));
    } catch (_) {
      // El formulario sigue funcionando aunque el navegador bloquee sessionStorage.
    }
  }, true);

  const confirmationForm = document.body?.dataset.leadConfirmation;
  if (!leadForms.has(confirmationForm)) return;

  let pendingLead = null;
  try {
    const storedLead = sessionStorage.getItem(markerKey(confirmationForm));
    if (storedLead) pendingLead = JSON.parse(storedLead);
  } catch (_) {
    pendingLead = null;
  }

  const expectedSection = confirmationForm === 'contacto-sociales'
    ? '/eventos-sociales/'
    : '/eventos-corporativos/';
  const isValidConfirmation = pendingLead
    && pendingLead.formName === confirmationForm
    && typeof pendingLead.submissionKey === 'string'
    && pendingLead.submissionKey.length >= 20
    && typeof pendingLead.sourcePage === 'string'
    && pendingLead.sourcePage.startsWith(expectedSection)
    && Number.isFinite(pendingLead.createdAt)
    && Date.now() - pendingLead.createdAt >= 0
    && Date.now() - pendingLead.createdAt <= markerLifetimeMs;

  try {
    sessionStorage.removeItem(markerKey(confirmationForm));
  } catch (_) {
    // La ausencia del marcador evita que un refresh vuelva a medir el lead.
  }

  if (!isValidConfirmation) return;

  setEventContext(pendingLead.eventType, pendingLead.sourcePage);
  window.dataLayer.push({
    event: 'generate_lead',
    event_type: eventType(pendingLead.eventType),
    source_page: pendingLead.sourcePage,
    transaction_id: pendingLead.submissionKey,
  });
})();
