(() => {
  if (window.__siConfirmedFormsLoaded) return;
  window.__siConfirmedFormsLoaded = true;
  const formNames = new Set(['contacto-corporativos', 'contacto-sociales']);
  const consultationFields = ['nombre', 'empresa', 'email', 'telefono', 'tipo', 'fecha', 'localidad', 'invitados', 'mensaje'];
  const lifetime = 15 * 60 * 1000;
  const pending = new WeakSet();
  const originalButtons = new WeakMap();
  const uuid = () => typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 3 | 8)).toString(16);
    });
  const read = (key) => { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } };
  const write = (key, value) => { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} };
  // Store only a fingerprint, never names, phone numbers or messages.
  const fingerprint = (value) => {
    let a = 0x811c9dc5, b = 0x9e3779b9;
    for (let i = 0; i < value.length; i++) {
      a = Math.imul(a ^ value.charCodeAt(i), 16777619) >>> 0;
      b = Math.imul(b ^ value.charCodeAt(i), 2246822519) >>> 0;
    }
    return `${a.toString(16)}-${b.toString(16)}-${value.length}`;
  };
  let sessionId = read('si-confirmed-forms-session');
  if (typeof sessionId !== 'string' || !/^[a-f\d-]{36}$/i.test(sessionId)) {
    sessionId = uuid();
    write('si-confirmed-forms-session', sessionId);
  }
  for (const form of document.forms) {
    if (!formNames.has(form.name)) continue;
    const set = (name, value) => { const input = form.elements.namedItem(name); if (input) input.value = value; };
    set('notification_version', '2');
    set('tracking_session_id', sessionId);
    set('tracking_timezone', Intl.DateTimeFormat().resolvedOptions().timeZone || '');
    set('tracking_device_type', /Mobi|Android.*Mobile|iPhone/i.test(navigator.userAgent) ? 'mobile' : /iPad|Tablet/i.test(navigator.userAgent) ? 'tablet' : 'desktop');
  }
  // Window capture runs before the existing analytics listener on document, so
  // analytics and the verified Netlify event use the same consultation ID.
  window.addEventListener('submit', (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !formNames.has(form.name)) return;
    if (pending.has(form) || !form.checkValidity()) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!pending.has(form)) form.reportValidity();
      return;
    }
    const values = consultationFields.map((name) => String(form.elements.namedItem(name)?.value || '').trim());
    const signature = fingerprint(JSON.stringify(values));
    const key = `si-consultation-attempt:${form.name}`;
    const previous = read(key);
    const elapsed = Date.now() - previous?.at;
    const sameAttempt = previous?.signature === signature && elapsed >= 0 && elapsed < lifetime;
    const id = sameAttempt ? previous.id : uuid();
    form.elements.namedItem('submission_key').value = id;
    write(key, { signature, id, at: Date.now() });
    pending.add(form);
    form.setAttribute('aria-busy', 'true');
    form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((button) => {
      originalButtons.set(button, { disabled: button.disabled, text: button.textContent });
      button.disabled = true;
      if (button.tagName === 'BUTTON') button.textContent = 'Enviando…';
    });
    // Native POST remains responsible for saving in Netlify and redirecting.
    // No browser event sends a contact or an email to GoHighLevel.
  }, true);
  window.addEventListener('pageshow', () => {
    for (const form of document.forms) {
      if (!formNames.has(form.name)) continue;
      pending.delete(form);
      form.removeAttribute('aria-busy');
      form.querySelectorAll('button[type="submit"], input[type="submit"]').forEach((button) => {
        const original = originalButtons.get(button);
        if (!original) return;
        button.disabled = original.disabled;
        if (button.tagName === 'BUTTON') button.textContent = original.text;
      });
    }
  });
})();
