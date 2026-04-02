const baseUrl = (process.env.SEO_AUDIT_BASE_URL || 'https://ptbizsms.com').replace(
  /\/$/,
  '',
);

const crawlEndpoints = ['/robots.txt', '/sitemap.xml'];
const indexableRoutes = [
  '/',
  '/v2/insights',
  '/v2/inbox',
  '/v2/runs',
  '/v2/sequences',
];

const results = [];

const toAbsolute = (path) => `${baseUrl}${path}`;

const read = async (path) => {
  const response = await fetch(toAbsolute(path), {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
  });
  return {
    endpoint: path,
    status: response.status,
    contentType: response.headers.get('content-type') || '',
    body: await response.text(),
  };
};

const parseJsonLdObjects = (html) => {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const parsed = [];

  for (const match of scripts) {
    const raw = match[1]?.trim();
    if (!raw) {
      continue;
    }
    try {
      const json = JSON.parse(raw);
      if (Array.isArray(json)) {
        parsed.push(...json);
      } else {
        parsed.push(json);
      }
    } catch (_error) {
      // Keep parsed list strict; malformed JSON-LD counts as missing.
    }
  }

  return parsed;
};

const failures = [];

for (const endpoint of crawlEndpoints) {
  const response = await read(endpoint);
  const bodyLower = response.body.toLowerCase();
  const isHtmlLeak = bodyLower.includes('<!doctype html') || bodyLower.includes('<html');

  if (endpoint === '/robots.txt') {
    const isText = /text\/plain/i.test(response.contentType);
    const hasDirectives =
      bodyLower.includes('user-agent:') && bodyLower.includes('sitemap:');
    const valid = response.status === 200 && isText && !isHtmlLeak && hasDirectives;
    results.push({
      endpoint,
      status: response.status,
      contentType: response.contentType,
      isHtmlLeak,
      valid,
    });
    if (!valid) {
      failures.push(`robots.txt invalid: status=${response.status}, contentType=${response.contentType}, htmlLeak=${isHtmlLeak}`);
    }
    continue;
  }

  const isXml = /(application|text)\/xml/i.test(response.contentType);
  const looksLikeSitemap = bodyLower.includes('<urlset') && bodyLower.includes('<loc>');
  const valid = response.status === 200 && isXml && !isHtmlLeak && looksLikeSitemap;
  results.push({
    endpoint,
    status: response.status,
    contentType: response.contentType,
    isHtmlLeak,
    valid,
  });
  if (!valid) {
    failures.push(`sitemap.xml invalid: status=${response.status}, contentType=${response.contentType}, htmlLeak=${isHtmlLeak}`);
  }
}

for (const route of indexableRoutes) {
  const response = await read(route);
  const bodyLower = response.body.toLowerCase();
  const hasNoindex = /<meta[^>]*name=["']robots["'][^>]*content=["'][^"']*noindex/i.test(
    bodyLower,
  );
  const parsedLd = parseJsonLdObjects(response.body);
  const jsonLdCount = parsedLd.length;
  const hasWebSite = parsedLd.some((item) => item && item['@type'] === 'WebSite');
  const hasOrganization = parsedLd.some(
    (item) => item && item['@type'] === 'Organization',
  );
  const valid =
    response.status === 200 &&
    !hasNoindex &&
    jsonLdCount > 0 &&
    hasWebSite &&
    hasOrganization;

  results.push({
    endpoint: route,
    status: response.status,
    contentType: response.contentType,
    isHtmlLeak: false,
    jsonLdCount,
    hasNoindex,
    valid,
  });

  if (!valid) {
    failures.push(
      `route ${route} invalid: status=${response.status}, noindex=${hasNoindex}, jsonLdCount=${jsonLdCount}, hasWebSite=${hasWebSite}, hasOrganization=${hasOrganization}`,
    );
  }
}

console.log(JSON.stringify({ baseUrl, results }, null, 2));

if (failures.length > 0) {
  console.error('\nSEO surface verification failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

