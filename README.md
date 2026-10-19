# Show Interactivo — Landings

Sitio estático construido con Astro 7. Conserva el diseño original de las landings sociales y corporativas, sus páginas de testimonios, los 57 videos y formularios compatibles con Netlify Forms.

## Desarrollo

```bash
npm install
npm run dev
```

## Verificación y producción

```bash
npm run check
npm run build
npm run preview
```

El build se genera en `dist/`.

## Despliegue en Netlify

El archivo `netlify.toml` ya define:

- comando de build: `npm run build`
- directorio publicado: `dist`
- Node.js 24
- caché anual para los recursos de `public/media`
- redirecciones permanentes desde las URLs cortas y las cuatro URLs HTML anteriores hacia las rutas canónicas `eventos-*`
- cabeceras básicas de seguridad

En Netlify sólo hace falta importar el repositorio. Los formularios `contacto-sociales` y `contacto-corporativos` serán detectados durante el build.

## Avisos de consultas confirmadas en GoHighLevel

Las ocho landings de Sociales y Corporativos usan el POST nativo de Netlify Forms. `public/form-confirmation.js` bloquea un segundo envío mientras el primero está en curso y conserva el identificador de una consulta idéntica durante 15 minutos para reconocer reintentos desde el mismo navegador. El identificador también se usa en la medición y la sincronización con Sheets.

La función `netlify/functions/notify-confirmed-consultation.mjs` escucha únicamente el evento firmado `formSubmitted`, emitido por Netlify al verificar una consulta. Valida los campos requeridos y reclama de forma atómica su identificador en el almacén Blobs `confirmed-consultation-notifications`, con consistencia fuerte. Sólo quien obtiene esa reserva transmite el evento al endpoint de External Tracking de GHL. Las entregas repetidas del mismo identificador se omiten. Los filtros de los workflows A-SI! CORPORATIVOS y A-SI! SOCIALES conservan sus nombres de formulario existentes.

El script automático `external-tracking.js` ya no se incluye en las páginas: ese script emitía eventos al pulsar Enviar, incluso si la validación del navegador impedía guardar el formulario. El seguimiento de conversiones de GTM y las UTMs del contacto se conservan.

Los registros de Blobs guardan el identificador, las fechas y el estado del aviso, sin copiar los datos personales de la consulta. Ante una respuesta perdida o un fallo de GHL, la reserva pasa a `needs-review` y la función registra el error. No se reenvía automáticamente un resultado incierto: primero hay que contrastar el contacto y los correos de GHL para evitar duplicar un aviso ya aceptado. La consulta original permanece en Netlify y la sincronización a Sheets es independiente. No borrar una reserva de aviso sin hacer esa comprobación.

`notification_version=2` identifica las páginas nuevas. Las consultas de una página antigua que siga abierta mantienen su captura anterior y no generan además un aviso desde esta función.

El formulario nativo de Trivias Fun pertenece a otro sitio y conserva su trigger nativo Form Submitted; no usa el capturador automático retirado de estas landings.

Verificar la protección con `npm test` y compilar con `npm run build` antes de publicar.

## Sincronización con Google Sheets

Las consultas verificadas por Netlify Forms se sincronizan con su planilla correspondiente: `CONSULTAS SOCIALES DESDE ABRIL 2026` para Sociales y `SHOW INTERACTIVO CORPORATIVOS - CONSULTAS PROCEDENCIA 2026` para Corporativos. La función conserva Netlify Forms como respaldo y envía únicamente los campos permitidos a un webhook firmado.

1. En la [planilla](https://docs.google.com/spreadsheets/d/1vYxH69oHIQi5FwWrbESupSYQHtonou97rb2Ktz9-8QQ/edit), abrir **Extensiones → Apps Script** y pegar `integrations/google-sheets/Code.gs`.
2. Guardar el script, volver a cargar la planilla y elegir **Integración web → Generar secreto**. Copiar el valor mostrado en el cuadro de diálogo.
3. Desplegar el script como **Aplicación web**, ejecutándolo como el propietario y permitiendo acceso a cualquier usuario. Copiar la URL terminada en `/exec`.
4. En Netlify, crear estas variables para Functions:
   - `GOOGLE_SHEETS_WEBHOOK_URL`: URL `/exec` del despliegue.
   - `GOOGLE_SHEETS_HMAC_SECRET`: secreto generado por `setupIntegration`.
5. Volver a desplegar el sitio.

En Sociales cada alta se agrega al final de la tabla única, manteniendo el orden cronológico por mes y copiando su formato A:M. En Corporativos se inserta en la fila 2 de la pestaña del mes de recepción en `America/Buenos_Aires`; si falta una pestaña mensual, el script crea `NN-Mes` copiando el formato de la última disponible. En ambos casos la consulta nueva queda con fondo amarillo.

Las dos variables deben configurarse antes de recibir consultas nuevas. Mientras falten, Netlify Forms conserva los envíos como respaldo, pero no los reenvía automáticamente cuando la integración se activa.

Este repositorio sólo contiene los formularios de Sociales y Corporativos. El formulario de Trivias pertenece a otro sitio o flujo y debe conectarse desde ese origen usando su esquema real de campos.

## Estructura

```text
src/
  pages/        Rutas Astro del sitio
  templates/    HTML, estilos y contenido visual originales
public/media/
  clips/        Videos de portada
  images/       Logo, fotos de eventos y logos de clientes
  videos/       57 testimonios corporativos por categoría
```

## Diseño y contenido

- `src/templates/landing-sociales.html`: landing de eventos sociales.
- `src/templates/landing-corporativos.html`: landing de eventos corporativos.
- `src/templates/testimonios-sociales.html`: testimonios sociales.
- `src/templates/testimonios-corporativos.html`: los 57 testimonios corporativos.

Las rutas Astro cargan estas plantillas sin alterar su apariencia. Los recursos están organizados bajo `public/media` y usan rutas absolutas para funcionar correctamente en Netlify.
