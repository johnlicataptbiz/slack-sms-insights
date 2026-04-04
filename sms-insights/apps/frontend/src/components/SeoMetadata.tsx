import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const BASE_URL = 'https://ptbizsms.com';
const DESCRIPTION =
  'PT Biz SMS Command Center provides SMS performance, inbox, sequence, and daily activity visibility.';

const BREADCRUMB_NAMES: Record<string, string> = {
  '/v2/insights': 'Performance',
  '/v2/inbox': 'Messages',
  '/v2/runs': 'Daily Activity',
  '/v2/sequences': 'Sequences',
};

const resolveCanonicalPath = (pathname: string): string => {
  if (!pathname || pathname === '/') {
    return '/';
  }

  for (const route of Object.keys(BREADCRUMB_NAMES)) {
    if (pathname === route || pathname.startsWith(`${route}/`)) {
      return route;
    }
  }

  return pathname;
};

const buildJsonLd = (canonicalPath: string) => {
  const canonicalUrl = new URL(canonicalPath, BASE_URL).toString();
  const schemas: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'PT Biz SMS Command Center',
      url: `${BASE_URL}/`,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: 'PT Biz SMS',
      url: `${BASE_URL}/`,
    },
  ];

  const crumbName = BREADCRUMB_NAMES[canonicalPath];
  if (crumbName) {
    schemas.push({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: `${BASE_URL}/`,
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: crumbName,
          item: canonicalUrl,
        },
      ],
    });
  }

  return { canonicalUrl, schemas };
};

export default function SeoMetadata() {
  const { pathname } = useLocation();

  useEffect(() => {
    const canonicalPath = resolveCanonicalPath(pathname);
    const { canonicalUrl, schemas } = buildJsonLd(canonicalPath);

    let description = document.querySelector(
      'meta[name="description"]',
    ) as HTMLMetaElement | null;
    if (!description) {
      description = document.createElement('meta');
      description.setAttribute('name', 'description');
      document.head.appendChild(description);
    }
    description.setAttribute('content', DESCRIPTION);

    let canonical = document.querySelector(
      'link[rel="canonical"]',
    ) as HTMLLinkElement | null;
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.setAttribute('rel', 'canonical');
      document.head.appendChild(canonical);
    }
    canonical.setAttribute('href', canonicalUrl);

    let jsonLd = document.getElementById(
      'ptbizsms-runtime-jsonld',
    ) as HTMLScriptElement | null;
    if (!jsonLd) {
      jsonLd = document.createElement('script');
      jsonLd.id = 'ptbizsms-runtime-jsonld';
      jsonLd.type = 'application/ld+json';
      document.head.appendChild(jsonLd);
    }
    jsonLd.textContent = JSON.stringify(schemas);
  }, [pathname]);

  return null;
}
