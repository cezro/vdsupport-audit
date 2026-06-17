export const CANONICAL_PAGES = [
  { slug: "home", file: "home.html" },
  { slug: "fase-service-page", file: "fase-service-page.html" },
  { slug: "full-arch-growth-system", file: "full-arch-growth-system.html" },
  { slug: "service-page", file: "service-page.html" },
  { slug: "ncla-quiz-funnel", file: "ncla-quiz-funnel.html" },
  { slug: "ncla-result-page", file: "ncla-result-page.html" },
  { slug: "course-641943", file: "course-641943.html" },
  { slug: "nextlevel-124405", file: "nextlevel-124405.html" },
  { slug: "discovery-call", file: "discovery-call.html" },
  { slug: "thank-you", file: "thank-you.html" },
  { slug: "result-page-4799-page", file: "result-page-4799-page.html" },
  { slug: "privacy-policy", file: "privacy-policy.html" },
  { slug: "terms-of-use", file: "terms-of-use.html" },
] as const;

export type PageSlug = (typeof CANONICAL_PAGES)[number]["slug"];

export const PAGE_SLUGS = CANONICAL_PAGES.map((page) => page.slug);
