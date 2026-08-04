# Show Interactivo — Landings

Sitio estático construido con Astro 7 y Tailwind CSS 4. Incluye las landings de eventos sociales y corporativos, sus páginas de testimonios, los 57 videos y formularios compatibles con Netlify Forms.

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
  components/   Componentes Astro compartidos
  data/         Copys, FAQs, testimonios, enlaces y URLs de videos
  layouts/      Layout global, navegación y pie
  pages/        Rutas del sitio
  styles/       Tailwind y tokens globales
public/media/
  clips/        Videos de portada
  images/       Logo, fotos de eventos y logos de clientes
  videos/       57 testimonios corporativos por categoría
```

## Edición de contenido

- `src/data/site.json`: contenido por tipo de evento, testimonios, Instagram y videos.
- `src/data/pages.json`: textos generales, cifras, diferenciales, FAQs y logos.

No es necesario modificar los componentes para agregar, quitar, ordenar o filtrar testimonios y videos.
