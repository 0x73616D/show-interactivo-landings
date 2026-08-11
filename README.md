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
- redirecciones desde las cuatro URLs HTML anteriores
- cabeceras básicas de seguridad

En Netlify sólo hace falta importar el repositorio. Los formularios `contacto-sociales` y `contacto-corporativos` serán detectados durante el build.

## Sincronización con Google Sheets

Las consultas verificadas por Netlify Forms pueden sincronizarse con la planilla mensual `SHOW INTERACTIVO CORPORATIVOS - CONSULTAS PROCEDENCIA 2026`. La función conserva Netlify Forms como respaldo y envía únicamente los campos permitidos a un webhook firmado.

1. En la [planilla](https://docs.google.com/spreadsheets/d/1vYxH69oHIQi5FwWrbESupSYQHtonou97rb2Ktz9-8QQ/edit), abrir **Extensiones → Apps Script** y pegar `integrations/google-sheets/Code.gs`.
2. Guardar el script, volver a cargar la planilla y elegir **Integración web → Generar secreto**. Copiar el valor mostrado en el cuadro de diálogo.
3. Desplegar el script como **Aplicación web**, ejecutándolo como el propietario y permitiendo acceso a cualquier usuario. Copiar la URL terminada en `/exec`.
4. En Netlify, crear estas variables para Functions:
   - `GOOGLE_SHEETS_WEBHOOK_URL`: URL `/exec` del despliegue.
   - `GOOGLE_SHEETS_HMAC_SECRET`: secreto generado por `setupIntegration`.
5. Volver a desplegar el sitio.

Cada alta se inserta en la fila 2 de la pestaña correspondiente al mes de recepción en `America/Buenos_Aires`, con fondo amarillo y el esquema A:M existente. Si falta una pestaña mensual, el script crea `NN-Mes` copiando el formato de la última pestaña disponible.

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
