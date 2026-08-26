type JsonLd = Record<string, unknown>;

type LandingSeo = {
  title: string;
  description: string;
  canonical: string;
  image: string;
  imageAlt: string;
  heroHeadingHtml: string;
  eventType: string;
  landingPath: string;
  structuredData?: JsonLd[];
};

const escapeAttribute = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('"', '&quot;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;');

const decodeEntities = (value: string) => value
  .replaceAll('&nbsp;', ' ')
  .replaceAll('&amp;', '&')
  .replaceAll('&quot;', '"')
  .replaceAll('&#39;', "'")
  .replaceAll('&apos;', "'")
  .replaceAll('&lt;', '<')
  .replaceAll('&gt;', '>')
  .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
  .replace(/&#x([\da-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));

const htmlToText = (value: string) => decodeEntities(
  value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
)
  .replace(/\s+/g, ' ')
  .trim();

export const faqPageSchemaFromHtml = (html: string): JsonLd => {
  const faqPattern = /<div class="faq-item"[^>]*>\s*<button class="faq-q"[^>]*>\s*<span class="faq-num">[^<]*<\/span>([\s\S]*?)<\/button>\s*<div class="faq-a">([\s\S]*?)<\/div>\s*<\/div>/g;
  const mainEntity = Array.from(html.matchAll(faqPattern), (match) => ({
    '@type': 'Question',
    name: htmlToText(match[1] ?? ''),
    acceptedAnswer: {
      '@type': 'Answer',
      text: htmlToText(match[2] ?? '')
    }
  }));

  if (!mainEntity.length) {
    throw new Error('No se encontraron preguntas frecuentes para generar FAQPage.');
  }

  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity
  };
};

const renderStructuredData = (items: JsonLd[] = []) => items
  .map((item) => `<script type="application/ld+json">${JSON.stringify(item).replaceAll('<', '\\u003c')}</script>`)
  .join('\n');

export const applyLandingSeo = (template: string, seo: LandingSeo) => {
  const replacements: Record<string, string> = {
    __SI_META_TITLE__: escapeAttribute(seo.title),
    __SI_META_DESCRIPTION__: escapeAttribute(seo.description),
    __SI_CANONICAL_URL__: escapeAttribute(seo.canonical),
    __SI_OG_IMAGE__: escapeAttribute(seo.image),
    __SI_OG_IMAGE_ALT__: escapeAttribute(seo.imageAlt),
    __SI_HERO_HEADING__: seo.heroHeadingHtml,
    __SI_EVENT_TYPE__: escapeAttribute(seo.eventType),
    __SI_LANDING_PATH__: escapeAttribute(seo.landingPath),
    __SI_STRUCTURED_DATA__: renderStructuredData(seo.structuredData)
  };

  const page = Object.entries(replacements).reduce(
    (html, [placeholder, value]) => html.replaceAll(placeholder, value),
    template
  );
  const unresolved = page.match(/__SI_[A-Z0-9_]+__/g);

  if (unresolved) {
    throw new Error(`Placeholders sin resolver: ${[...new Set(unresolved)].join(', ')}`);
  }

  return page;
};
