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
