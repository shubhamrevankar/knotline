import { describe, expect, it } from "vitest";

import { robotsPolicy, sitemap } from "./seo.js";

describe("public discovery policy", () => {
  it("blocks non-production crawlers and protected planes", () => {
    expect(robotsPolicy(false)).toContain("Disallow: /");
    expect(robotsPolicy(true)).toContain("Disallow: /app/");
    expect(robotsPolicy(true)).toContain("Disallow: /ops/");
  });

  it("creates canonical absolute sitemap entries", () => {
    expect(sitemap("https://product.example/", ["/", "/product"])).toContain(
      "<loc>https://product.example/product</loc>"
    );
  });
});
