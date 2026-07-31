export const robotsPolicy = (production: boolean): string =>
  production
    ? ["User-agent: *", "Allow: /", "Disallow: /app/", "Disallow: /ops/", "Disallow: /auth/"].join(
        "\n"
      )
    : ["User-agent: *", "Disallow: /"].join("\n");

export const sitemap = (origin: string, paths: readonly string[]): string => {
  const base = origin.replace(/\/$/u, "");
  const urls = paths.map((path) => `  <url><loc>${base}${path}</loc></url>`).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
};
