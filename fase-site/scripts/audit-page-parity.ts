import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import { chromium, type Page } from "playwright";
import type { GhlPageData } from "../lib/types";
import { getExternalScriptUrls, getInlineScriptBodies } from "../lib/types";

type Severity = "P0" | "P1" | "P2" | "P3";
type RootCause =
  | "stale_export"
  | "import_loss"
  | "runtime_failure"
  | "live_baseline_bug"
  | "unknown";

type Finding = {
  id: string;
  severity: Severity;
  category: string;
  element: string;
  live: string;
  local: string;
  rootCause: RootCause;
  evidence: string;
};

type StaticInventory = {
  source: string;
  title: string;
  description: string;
  ogImage: string;
  counts: Record<string, number>;
  ids: string[];
  classes: string[];
  imageUrls: string[];
  externalScripts: string[];
  inlineScriptCount: number;
  inlineScriptChars: number;
  headings: string[];
  textFingerprint: string;
  hasSelector: Record<string, boolean>;
};

type RuntimeSnapshot = {
  source: string;
  viewport: string;
  scope: string;
  ids: string[];
  headings: string[];
  navLinks: string[];
  ctaLabels: string[];
  imageCount: number;
  brokenImages: number;
  stylesheetCount: number;
  ghlScriptLoaded: boolean;
  widgets: {
    nlcaBannerExists: boolean;
    nlcaBannerVisible: boolean;
    logoSliderExists: boolean;
    logoTrackWiderThanSlider: boolean;
    videoCount: number;
    videoPlayerReady: boolean;
    zeroStatCounters: boolean;
    homeLendingCopy: boolean;
  };
  heroH1FontFamily: string;
};

type BehavioralResult = {
  test: string;
  live: boolean | string;
  local: boolean | string;
  pass: boolean;
  rootCause: RootCause;
};

type AuditReport = {
  generatedAt: string;
  slug: string;
  liveUrl: string;
  localUrl: string;
  summary: {
    totalFindings: number;
    bySeverity: Record<Severity, number>;
    parityScore: number;
    behavioralPassRate: string;
  };
  findings: Finding[];
  static: {
    live: StaticInventory;
    export: StaticInventory;
    json: StaticInventory;
    staleness: Array<{ field: string; live: string; export: string }>;
    importLoss: Array<{ field: string; export: string; json: string }>;
  };
  runtime: {
    desktop: { live: RuntimeSnapshot; local: RuntimeSnapshot };
    mobile: { live: RuntimeSnapshot; local: RuntimeSnapshot };
  };
  behavioral: BehavioralResult[];
  recommendedFixes: string[];
};

const KEY_SELECTORS = [
  "nlca-banner-wrap",
  "logoSlider1",
  "logoTrack1",
  "video-0LrZKafPem",
  "ghl-root",
];

const NAV_LABELS = ["About", "Framework", "Results", "Contact Us", "Services"];
const CTA_LABELS = ["GET THE FRAMEWORK", "book a discovery call"];

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const index = args.indexOf(flag);
    return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
  };

  return {
    slug: get("--slug", "home"),
    liveUrl: get("--live", "https://fullarchsalesexperts.com/home"),
    localUrl: get("--local", "http://localhost:3000/home"),
    skipBrowser: args.includes("--skip-browser"),
  };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function textFingerprint(html: string): string {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = normalizeText($("body").text()).toLowerCase();
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function extractInventory(source: string, html: string): StaticInventory {
  const $ = cheerio.load(html);
  const bodyHtml = $("body").html() ?? html;

  const ids = new Set<string>();
  const classes = new Set<string>();
  $("[id]").each((_, element) => {
    const id = $(element).attr("id");
    if (id) ids.add(id);
  });
  $("[class]").each((_, element) => {
    const className = $(element).attr("class");
    if (className) {
      for (const part of className.split(/\s+/)) {
        if (part) classes.add(part);
      }
    }
  });

  const imageUrls = $("img")
    .map((_, element) => $(element).attr("src") ?? "")
    .get()
    .filter((src) => src.includes("assets.cdn.filesafe.space"));

  const externalScripts = [
    ...$("head script[src]")
      .map((_, element) => $(element).attr("src") ?? "")
      .get(),
    ...$("body script[src]")
      .map((_, element) => $(element).attr("src") ?? "")
      .get(),
  ].filter(Boolean);

  const inlineScripts = [
    ...$("head script:not([src])")
      .map((_, element) => $(element).html() ?? "")
      .get(),
    ...$("body script:not([src])")
      .map((_, element) => $(element).html() ?? "")
      .get(),
  ].filter((script) => script.trim().length > 0);

  const headings = ["h1", "h2", "h3"]
    .flatMap((tag) =>
      $(tag)
        .map((_, element) => normalizeText($(element).text()))
        .get(),
    )
    .filter(Boolean)
    .slice(0, 40);

  const hasSelector: Record<string, boolean> = {};
  for (const selector of KEY_SELECTORS) {
    hasSelector[selector] =
      bodyHtml.includes(`id="${selector}"`) ||
      bodyHtml.includes(`id='${selector}'`) ||
      ids.has(selector);
  }

  return {
    source,
    title: normalizeText($("title").first().text()),
    description: $('meta[name="description"]').attr("content")?.trim() ?? "",
    ogImage: $('meta[property="og:image"]').attr("content")?.trim() ?? "",
    counts: {
      img: $("img").length,
      h1: $("h1").length,
      h2: $("h2").length,
      h3: $("h3").length,
      a: $("a").length,
      iframe: $("iframe").length,
      video: $("video").length,
      script: $("script").length,
      stylesheet: $("link[rel='stylesheet']").length,
    },
    ids: [...ids].sort(),
    classes: [...classes].sort(),
    imageUrls: [...new Set(imageUrls)].sort(),
    externalScripts: [...new Set(externalScripts)].sort(),
    inlineScriptCount: inlineScripts.length,
    inlineScriptChars: inlineScripts.join("").length,
    headings,
    textFingerprint: textFingerprint(html),
    hasSelector,
  };
}

function inventoryFromJson(source: string, page: GhlPageData): StaticInventory {
  const pseudoHtml = `<html><head><title>${page.metadata.title ?? ""}</title></head><body>${page.bodyHtml}</body></html>`;
  const inventory = extractInventory(source, pseudoHtml);
  const inlineScripts = getInlineScriptBodies(page);
  inventory.externalScripts = getExternalScriptUrls(page).sort();
  inventory.inlineScriptCount = inlineScripts.length;
  inventory.inlineScriptChars = inlineScripts.join("").length;
  inventory.description = page.metadata.description ?? "";
  inventory.ogImage = page.metadata.openGraph?.image ?? "";
  inventory.hasSelector["ghl-root"] = false;
  for (const selector of KEY_SELECTORS) {
    if (selector === "ghl-root") continue;
    inventory.hasSelector[selector] =
      page.bodyHtml.includes(`id="${selector}"`) ||
      page.bodyHtml.includes(`id='${selector}'`);
  }
  return inventory;
}

function diffField<T extends string | number>(
  field: string,
  left: T,
  right: T,
): { field: string; live: string; export: string } | null {
  if (left === right) return null;
  return { field, live: String(left), export: String(right) };
}

function symmetricDiff(left: string[], right: string[]) {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  return {
    onlyLeft: left.filter((item) => !rightSet.has(item)),
    onlyRight: right.filter((item) => !leftSet.has(item)),
  };
}

function classifyRuntimeFinding(
  liveValue: boolean | number | string,
  localValue: boolean | number | string,
  jsonHasContent: boolean,
  exportHasContent: boolean,
): RootCause {
  if (liveValue === localValue) return "live_baseline_bug";
  if (!jsonHasContent && exportHasContent) return "import_loss";
  if (jsonHasContent && localValue !== liveValue) return "runtime_failure";
  if (!exportHasContent) return "stale_export";
  return "unknown";
}

function addFinding(
  findings: Finding[],
  finding: Omit<Finding, "id">,
): void {
  findings.push({
    id: `F${String(findings.length + 1).padStart(3, "0")}`,
    ...finding,
  });
}

async function fetchLiveHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": "FASE-parity-audit/1.0" },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch live HTML (${response.status})`);
  }
  return response.text();
}

async function captureRuntimeSnapshot(
  page: Page,
  source: string,
  scopeSelector: string,
  viewport: string,
): Promise<RuntimeSnapshot> {
  const scopeExists = await page.locator(scopeSelector).count();
  const scope = scopeExists > 0 ? scopeSelector : "body";

  return page.evaluate(
    ({ sourceLabel, scopeSel, viewportLabel }) => {
      const scopeEl =
        document.querySelector(scopeSel) ?? document.body;
      const text = scopeEl.textContent ?? "";

      const ids = [...scopeEl.querySelectorAll("[id]")]
        .map((element) => element.id)
        .filter(Boolean)
        .sort();

      const headings = [...scopeEl.querySelectorAll("h1,h2,h3")]
        .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 40);

      const navLinks = [...scopeEl.querySelectorAll("a")]
        .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter((label) =>
          ["About", "Framework", "Results", "Contact Us", "Services"].includes(label),
        );

      const ctaLabels = [...scopeEl.querySelectorAll("a,button")]
        .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter((label) =>
          ["GET THE FRAMEWORK", "book a discovery call"].some((target) =>
            label.toLowerCase().includes(target.toLowerCase()),
          ),
        );

      const images = [...scopeEl.querySelectorAll("img")];
      const brokenImages = images.filter(
        (img) => img.complete && img.naturalWidth === 0,
      ).length;

      const slider = document.getElementById("logoSlider1");
      const track = document.getElementById("logoTrack1");
      const banner = document.getElementById("nlca-banner-wrap");
      const bannerStyle = banner ? getComputedStyle(banner) : null;

      const videos = [...scopeEl.querySelectorAll('[id^="video-"], video')];
      const videoPlayerReady = !!scopeEl.querySelector(
        ".vjs-ghl, .video-js, .vjs-big-play-button, .vjs-control-bar",
      );

      const hero = scopeEl.querySelector("h1");
      const heroStyle = hero ? getComputedStyle(hero) : null;

      return {
        source: sourceLabel,
        viewport: viewportLabel,
        scope: scopeSel,
        ids,
        headings,
        navLinks: [...new Set(navLinks)],
        ctaLabels: [...new Set(ctaLabels)],
        imageCount: images.length,
        brokenImages,
        stylesheetCount: document.querySelectorAll('link[rel="stylesheet"]').length,
        ghlScriptLoaded: [...document.scripts].some((script) =>
          script.src.includes("stcdn.leadconnectorhq.com"),
        ),
        widgets: {
          nlcaBannerExists: !!banner,
          nlcaBannerVisible:
            !!banner &&
            bannerStyle?.display !== "none" &&
            bannerStyle?.visibility !== "hidden",
          logoSliderExists: !!slider,
          logoTrackWiderThanSlider:
            !!slider && !!track && track.scrollWidth > slider.clientWidth,
          videoCount: videos.length,
          videoPlayerReady,
          zeroStatCounters: /0%\s*conversion|Only 0%|0\+ arches/i.test(text),
          homeLendingCopy: /home lending products/i.test(text),
        },
        heroH1FontFamily: heroStyle?.fontFamily ?? "",
      };
    },
    { sourceLabel: source, scopeSel: scope, viewportLabel: viewport },
  );
}

async function testAboutScroll(page: Page, isLocal: boolean): Promise<string> {
  const aboutLink = page.getByRole("link", { name: "About" }).first();
  const section = page.locator("#section-gZUH5va2Kn");

  if ((await aboutLink.count()) === 0 || (await section.count()) === 0) {
    return "missing";
  }

  if (isLocal) {
    const href = (await aboutLink.getAttribute("href")) ?? "";
    if (!href.includes("section-gZUH5va2Kn")) {
      return "bad_href";
    }
  }

  await page.evaluate(() => {
    for (const element of document.querySelectorAll("a")) {
      const label = (element.textContent ?? "").replace(/\s+/g, " ").trim();
      if (label === "About" || element.getAttribute("aria-label") === "About") {
        element.addEventListener(
          "click",
          (event) => {
            if (element.getAttribute("href")?.includes("#")) {
              event.preventDefault();
            }
          },
          { capture: true, once: true },
        );
      }
    }
  });

  const beforeTop = await section.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  await aboutLink.click({ noWaitAfter: true });
  await page.waitForTimeout(900);
  const afterTop = await section.evaluate(
    (element) => element.getBoundingClientRect().top,
  );

  return afterTop < beforeTop - 40 || Math.abs(afterTop) < 540 ? "scrolled" : "no_scroll";
}

async function testContactModal(page: Page): Promise<string> {
  const contactLink = page.getByRole("link", { name: "Contact Us" }).first();

  if ((await contactLink.count()) === 0) {
    return "no_link";
  }

  await contactLink.click({ noWaitAfter: true });
  await page.waitForTimeout(1500);

  return page.evaluate(() => {
    const popup =
      document.getElementById("hl_main_popup-iJLs6PkCzQ") ??
      document.querySelector("#teleports #hl_main_popup-iJLs6PkCzQ") ??
      document.querySelector(".hl_main_popup-iJLs6PkCzQ");
    if (!popup) return "no_popup";
    const style = getComputedStyle(popup);
    return style.display !== "none" && style.visibility !== "hidden"
      ? "visible"
      : "hidden";
  });
}

async function runInteractiveTests(
  livePage: Page,
  localPage: Page,
  slug: string,
): Promise<BehavioralResult[]> {
  const results: BehavioralResult[] = [];
  const hydrationWaitMs = slug === "discovery-call" ? 12000 : 8000;

  await livePage.waitForTimeout(hydrationWaitMs);
  await localPage.waitForTimeout(hydrationWaitMs);

  const push = (
    test: string,
    live: boolean | string,
    local: boolean | string,
    rootCause: RootCause = "runtime_failure",
  ) => {
    results.push({
      test,
      live,
      local,
      pass: live === local,
      rootCause,
    });
  };

  if (slug === "home") {
    const liveHero = await livePage.evaluate(() => {
      const bg =
        document.querySelector("#section-MVapZAeLfM .bg") ??
        document.querySelector(".bg-section-MVapZAeLfM");
      if (!bg) return "no_element";
      const backgroundImage = getComputedStyle(bg).backgroundImage;
      return backgroundImage && backgroundImage !== "none" ? "has_image" : "none";
    });

    const localHero = await localPage.evaluate(() => {
      const root = document.querySelector("#ghl-root") ?? document.body;
      const bg =
        root.querySelector("#section-MVapZAeLfM .bg") ??
        root.querySelector(".bg-section-MVapZAeLfM");
      if (!bg) return "no_element";
      const backgroundImage = getComputedStyle(bg).backgroundImage;
      return backgroundImage && backgroundImage !== "none" ? "has_image" : "none";
    });

    push("Hero background image present", liveHero, localHero);

    const liveHeading = await livePage.evaluate(() => {
      const heading = document.querySelector(".heading-y1tPJKWxLx.text-output");
      return heading && getComputedStyle(heading).opacity !== "0"
        ? "visible"
        : "hidden";
    });
    const localHeading = await localPage.evaluate(() => {
      const root = document.querySelector("#ghl-root") ?? document.body;
      const heading = root.querySelector(".heading-y1tPJKWxLx.text-output");
      return heading && getComputedStyle(heading).opacity !== "0"
        ? "visible"
        : "hidden";
    });
    push("Hero heading visible", liveHeading, localHeading);

    const liveAbout = await testAboutScroll(livePage, false);
    const localAbout = await testAboutScroll(localPage, true);
    push("About nav scrolls to section", liveAbout, localAbout);

    const liveContact = await testContactModal(livePage);
    const localContact = await testContactModal(localPage);
    push("Contact Us opens modal", liveContact, localContact);
  }

  if (slug === "discovery-call") {
    const liveCalendar = await livePage.evaluate(() => {
      const loader = document.querySelector(".calendars-ellipsis-loader");
      const widget = document.querySelector("#appointment_widgets--revamp");
      if (!widget) return "no_widget";
      if (!loader) return "loaded";
      const style = getComputedStyle(loader);
      return style.display === "none" || style.visibility === "hidden"
        ? "loaded"
        : "spinning";
    });

    const localCalendar = await localPage.evaluate(() => {
      const root = document.querySelector("#ghl-root") ?? document.body;
      const loader = root.querySelector(".calendars-ellipsis-loader");
      const widget = root.querySelector("#appointment_widgets--revamp");
      if (!widget) return "no_widget";
      if (!loader) return "loaded";
      const style = getComputedStyle(loader);
      return style.display === "none" || style.visibility === "hidden"
        ? "loaded"
        : "spinning";
    });

    push("Discovery calendar loaded", liveCalendar, localCalendar);
  }

  return results;
}

async function runBehavioralTests(
  livePage: Page,
  localPage: Page,
  slug: string,
): Promise<BehavioralResult[]> {
  const results: BehavioralResult[] = [];

  async function readState(page: Page, isLocal: boolean) {
    const scope = isLocal ? "#ghl-root, body" : "body";
    return page.evaluate((scopeSelector) => {
      const scope =
        document.querySelector("#ghl-root") ??
        document.querySelector(scopeSelector) ??
        document.body;

      const banner = document.getElementById("nlca-banner-wrap");
      const slider = document.getElementById("logoSlider1");
      const track = document.getElementById("logoTrack1");
      const navLabels = [...scope.querySelectorAll("a")]
        .map((element) => (element.textContent ?? "").replace(/\s+/g, " ").trim())
        .filter(Boolean);
      const ctas = [...scope.querySelectorAll("a,button")]
        .map((element) => ({
          label: (element.textContent ?? "").replace(/\s+/g, " ").trim(),
          href: element instanceof HTMLAnchorElement ? element.href : "",
        }))
        .filter((item) => item.label.length > 0);

      return {
        bannerExists: !!banner,
        bannerVisible:
          !!banner &&
          getComputedStyle(banner).display !== "none" &&
          getComputedStyle(banner).visibility !== "hidden",
        sliderWide:
          !!slider && !!track && track.scrollWidth > slider.clientWidth,
        videoReady: !!scope.querySelector(
          ".vjs-ghl, .video-js, .vjs-big-play-button, .vjs-control-bar",
        ),
        nav: {
          About: navLabels.includes("About"),
          Framework: navLabels.includes("Framework"),
          Results: navLabels.includes("Results"),
          "Contact Us": navLabels.includes("Contact Us"),
          Services: navLabels.includes("Services"),
        },
        ctaFramework: ctas.some((item) =>
          item.label.toLowerCase().includes("get the framework"),
        ),
        ctaDiscovery: ctas.some((item) =>
          item.label.toLowerCase().includes("book a discovery call"),
        ),
      };
    }, scope);
  }

  const liveState = await readState(livePage, false);
  const localState = await readState(localPage, true);

  const push = (
    test: string,
    live: boolean | string,
    local: boolean | string,
    rootCause: RootCause = "unknown",
  ) => {
    results.push({
      test,
      live,
      local,
      pass: live === local,
      rootCause,
    });
  };

  push(
    "NLCA banner exists",
    liveState.bannerExists,
    localState.bannerExists,
    localState.bannerExists ? "unknown" : "runtime_failure",
  );
  push(
    "Logo slider track wider than container",
    liveState.sliderWide,
    localState.sliderWide,
    localState.sliderWide ? "unknown" : "runtime_failure",
  );
  push(
    "Video player UI present",
    liveState.videoReady,
    localState.videoReady,
    localState.videoReady ? "unknown" : "runtime_failure",
  );

  for (const label of NAV_LABELS) {
    push(
      `Nav link: ${label}`,
      liveState.nav[label as keyof typeof liveState.nav],
      localState.nav[label as keyof typeof localState.nav],
    );
  }

  push("CTA: GET THE FRAMEWORK", liveState.ctaFramework, localState.ctaFramework);
  push(
    "CTA: book a discovery call",
    liveState.ctaDiscovery,
    localState.ctaDiscovery,
  );

  if (livePage.url().includes("fullarchsalesexperts.com")) {
    const liveCloseWorks = await livePage.evaluate(() => {
      const banner = document.getElementById("nlca-banner-wrap");
      const close = banner?.querySelector("[aria-label='Close banner'], [role='button']");
      if (!banner || !close) return "no_banner_or_close";
      (close as HTMLElement).click();
      return getComputedStyle(banner).display === "none" ? "hidden" : "visible";
    });

    const localCloseWorks = await localPage.evaluate(() => {
      const banner = document.getElementById("nlca-banner-wrap");
      const close = banner?.querySelector("[aria-label='Close banner'], [role='button']");
      if (!banner || !close) return "no_banner_or_close";
      (close as HTMLElement).click();
      return getComputedStyle(banner).display === "none" ? "hidden" : "visible";
    });

    push("Banner close button hides banner", liveCloseWorks, localCloseWorks);
  }

  const interactive = await runInteractiveTests(livePage, localPage, slug);
  results.push(...interactive);

  return results;
}

function buildRecommendedFixes(findings: Finding[]): string[] {
  const fixes: string[] = [];
  const causes = new Set(findings.map((finding) => finding.rootCause));

  if (causes.has("import_loss")) {
    fixes.push(
      "Extend import-ghl-pages.ts to capture head inline scripts and preserve script order without over-deduplicating.",
    );
  }
  if (causes.has("runtime_failure")) {
    fixes.push(
      "Adjust GhlPageRenderer to mount GHL HTML at document body level or delay GHL bundle until DOM matches live page structure.",
    );
    fixes.push(
      "Reduce client-only fetch latency by embedding page slug data via route handler or server-injected JSON bootstrap.",
    );
  }
  if (causes.has("stale_export")) {
    fixes.push(
      "Re-run fase-github-export/export-to-github.ps1 and npm run import:pages before parity testing.",
    );
  }
  if (findings.some((finding) => finding.evidence.includes("video"))) {
    fixes.push(
      "Verify stcdn.leadconnectorhq.com bundle loads and hydrates video widgets inside #ghl-root.",
    );
  }

  if (fixes.length === 0) {
    fixes.push("No migration-specific fixes required based on current parity results.");
  }

  return fixes;
}

function renderMarkdown(report: AuditReport): string {
  const lines: string[] = [];
  lines.push("# Home Page Parity Audit");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(`**Live URL:** ${report.liveUrl}`);
  lines.push(`**Local URL:** ${report.localUrl}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total findings:** ${report.summary.totalFindings}`);
  lines.push(
    `- **By severity:** P0=${report.summary.bySeverity.P0}, P1=${report.summary.bySeverity.P1}, P2=${report.summary.bySeverity.P2}, P3=${report.summary.bySeverity.P3}`,
  );
  lines.push(`- **Parity score:** ${report.summary.parityScore}% selector match`);
  lines.push(`- **Behavioral pass rate:** ${report.summary.behavioralPassRate}`);
  lines.push("");
  lines.push("## Findings (by severity)");
  lines.push("");

  for (const severity of ["P0", "P1", "P2", "P3"] as Severity[]) {
    const items = report.findings.filter((finding) => finding.severity === severity);
    if (items.length === 0) continue;
    lines.push(`### ${severity}`);
    lines.push("");
    for (const finding of items) {
      lines.push(`- **${finding.id}** — ${finding.category}: ${finding.element}`);
      lines.push(`  - Live: ${finding.live}`);
      lines.push(`  - Local: ${finding.local}`);
      lines.push(`  - Root cause: \`${finding.rootCause}\``);
      lines.push(`  - Evidence: ${finding.evidence}`);
    }
    lines.push("");
  }

  lines.push("## Static analysis");
  lines.push("");
  lines.push("| Metric | Live | Export | JSON |");
  lines.push("|--------|------|--------|------|");
  for (const key of ["img", "h1", "h2", "h3", "a", "script", "stylesheet"] as const) {
    lines.push(
      `| ${key} | ${report.static.live.counts[key]} | ${report.static.export.counts[key]} | ${report.static.json.counts[key]} |`,
    );
  }
  lines.push("");
  lines.push("### Staleness (live vs export)");
  lines.push("");
  if (report.static.staleness.length === 0) {
    lines.push("No material staleness detected.");
  } else {
    for (const item of report.static.staleness) {
      lines.push(`- **${item.field}:** live=${item.live} | export=${item.export}`);
    }
  }
  lines.push("");
  lines.push("### Import loss (export vs JSON)");
  lines.push("");
  if (report.static.importLoss.length === 0) {
    lines.push("No import loss detected.");
  } else {
    for (const item of report.static.importLoss) {
      lines.push(`- **${item.field}:** export=${item.export} | json=${item.json}`);
    }
  }
  lines.push("");
  lines.push("## Runtime analysis");
  lines.push("");
  lines.push("### Desktop widget comparison");
  lines.push("");
  lines.push("| Widget | Live | Local |");
  lines.push("|--------|------|-------|");
  const liveDesktop = report.runtime.desktop.live.widgets;
  const localDesktop = report.runtime.desktop.local.widgets;
  for (const key of Object.keys(liveDesktop) as Array<keyof typeof liveDesktop>) {
    lines.push(`| ${key} | ${liveDesktop[key]} | ${localDesktop[key]} |`);
  }
  lines.push("");
  lines.push("## Behavioral tests");
  lines.push("");
  lines.push("| Test | Live | Local | Pass |");
  lines.push("|------|------|-------|------|");
  for (const test of report.behavioral) {
    lines.push(`| ${test.test} | ${test.live} | ${test.local} | ${test.pass ? "yes" : "no"} |`);
  }
  lines.push("");
  lines.push("## Recommended fixes (ordered)");
  lines.push("");
  for (const [index, fix] of report.recommendedFixes.entries()) {
    lines.push(`${index + 1}. ${fix}`);
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const { slug, liveUrl, localUrl, skipBrowser } = parseArgs();
  const repoRoot = path.resolve(__dirname, "../..");
  const exportPath = path.join(
    repoRoot,
    "fase-github-export/site-export/html",
    `${slug}.html`,
  );
  const jsonPath = path.resolve(__dirname, "../content/pages", `${slug}.json`);
  const auditDir = path.resolve(__dirname, "../audit");

  fs.mkdirSync(auditDir, { recursive: true });

  console.log(`Fetching live HTML: ${liveUrl}`);
  const liveHtml = await fetchLiveHtml(liveUrl);
  const exportHtml = fs.readFileSync(exportPath, "utf8");
  const pageJson = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as GhlPageData;

  const liveStatic = extractInventory("live", liveHtml);
  const exportStatic = extractInventory("export", exportHtml);
  const jsonStatic = inventoryFromJson("json", pageJson);

  const staleness: Array<{ field: string; live: string; export: string }> = [];
  for (const field of [
    "title",
    "description",
    "textFingerprint",
  ] as const) {
    const diff = diffField(field, liveStatic[field], exportStatic[field]);
    if (diff) staleness.push(diff);
  }
  const liveExportImages = symmetricDiff(liveStatic.imageUrls, exportStatic.imageUrls);
  if (liveExportImages.onlyLeft.length || liveExportImages.onlyRight.length) {
    staleness.push({
      field: "imageUrls",
      live: `${liveExportImages.onlyLeft.length} only on live`,
      export: `${liveExportImages.onlyRight.length} only on export`,
    });
  }

  const importLoss: Array<{ field: string; export: string; json: string }> = [];
  if (exportStatic.inlineScriptCount !== jsonStatic.inlineScriptCount) {
    importLoss.push({
      field: "inlineScriptCount",
      export: String(exportStatic.inlineScriptCount),
      json: String(jsonStatic.inlineScriptCount),
    });
  }
  if (exportStatic.externalScripts.length !== jsonStatic.externalScripts.length) {
    importLoss.push({
      field: "externalScriptCount",
      export: String(exportStatic.externalScripts.length),
      json: String(jsonStatic.externalScripts.length),
    });
  }
  for (const selector of KEY_SELECTORS) {
    if (selector === "ghl-root") continue;
    if (exportStatic.hasSelector[selector] && !jsonStatic.hasSelector[selector]) {
      importLoss.push({
        field: `selector:${selector}`,
        export: "present",
        json: "missing",
      });
    }
  }

  const findings: Finding[] = [];

  for (const selector of KEY_SELECTORS) {
    if (selector === "ghl-root") continue;
    if (liveStatic.hasSelector[selector] && !jsonStatic.hasSelector[selector]) {
      addFinding(findings, {
        severity: selector === "nlca-banner-wrap" ? "P1" : "P0",
        category: "static",
        element: `#${selector}`,
        live: "present",
        local: "missing in imported JSON",
        rootCause: "import_loss",
        evidence: `Export HTML contains #${selector}, JSON bodyHtml does not.`,
      });
    }
  }

  if (liveStatic.textFingerprint !== exportStatic.textFingerprint) {
    addFinding(findings, {
      severity: "P2",
      category: "static",
      element: "page text fingerprint",
      live: liveStatic.textFingerprint,
      local: exportStatic.textFingerprint,
      rootCause: "stale_export",
      evidence: "Live HTML text fingerprint differs from exported snapshot.",
    });
  }

  const runtime = {
    desktop: {
      live: {} as RuntimeSnapshot,
      local: {} as RuntimeSnapshot,
    },
    mobile: {
      live: {} as RuntimeSnapshot,
      local: {} as RuntimeSnapshot,
    },
  };
  let behavioral: BehavioralResult[] = [];

  if (!skipBrowser) {
    const browser = await chromium.launch({ headless: true });
    const desktopContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const mobileContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });

    async function loadBoth(context: Awaited<ReturnType<typeof browser.newContext>>, viewportLabel: string) {
      const livePage = await context.newPage();
      const localPage = await context.newPage();

      await livePage.goto(liveUrl, { waitUntil: "networkidle", timeout: 120000 });
      await localPage.goto(localUrl, { waitUntil: "networkidle", timeout: 120000 });
      await livePage.waitForTimeout(3000);
      await localPage.waitForTimeout(3000);

      const liveSnap = await captureRuntimeSnapshot(
        livePage,
        "live",
        "body",
        viewportLabel,
      );
      const localSnap = await captureRuntimeSnapshot(
        localPage,
        "local",
        "#ghl-root",
        viewportLabel,
      );

      await livePage.close();
      await localPage.close();
      return { live: liveSnap, local: localSnap };
    }

    runtime.desktop = await loadBoth(desktopContext, "desktop");
    runtime.mobile = await loadBoth(mobileContext, "mobile");

    const liveBehaviorPage = await desktopContext.newPage();
    const localBehaviorPage = await desktopContext.newPage();
    await liveBehaviorPage.goto(liveUrl, { waitUntil: "networkidle", timeout: 120000 });
    await localBehaviorPage.goto(localUrl, { waitUntil: "networkidle", timeout: 120000 });
    await liveBehaviorPage.waitForTimeout(3000);
    await localBehaviorPage.waitForTimeout(3000);
    behavioral = await runBehavioralTests(
      liveBehaviorPage,
      localBehaviorPage,
      slug,
    );

    for (const selector of KEY_SELECTORS) {
      if (selector === "ghl-root") continue;
      const liveHas = await liveBehaviorPage.evaluate(
        (id) => !!document.getElementById(id),
        selector,
      );
      const localHas = await localBehaviorPage.evaluate(
        (id) => !!document.getElementById(id),
        selector,
      );
      if (liveHas && !localHas) {
        addFinding(findings, {
          severity: selector.includes("video") ? "P1" : "P0",
          category: "runtime",
          element: `#${selector}`,
          live: "present",
          local: "missing",
          rootCause: classifyRuntimeFinding(
            liveHas,
            localHas,
            jsonStatic.hasSelector[selector] ?? false,
            exportStatic.hasSelector[selector] ?? false,
          ),
          evidence: `Desktop runtime DOM missing #${selector} (document-level check).`,
        });
      }
    }

    await liveBehaviorPage.close();
    await localBehaviorPage.close();

    await desktopContext.close();
    await mobileContext.close();
    await browser.close();

    const desktopLive = runtime.desktop.live;
    const desktopLocal = runtime.desktop.local;

    if (desktopLive.widgets.videoPlayerReady && !desktopLocal.widgets.videoPlayerReady) {
      addFinding(findings, {
        severity: "P1",
        category: "runtime",
        element: "video player widgets",
        live: "ready",
        local: "not ready",
        rootCause: "runtime_failure",
        evidence: "Live has video.js/GHL player UI; local does not after hydration wait.",
      });
    }

    if (
      desktopLive.widgets.logoTrackWiderThanSlider &&
      !desktopLocal.widgets.logoTrackWiderThanSlider
    ) {
      addFinding(findings, {
        severity: "P1",
        category: "runtime",
        element: "logo slider",
        live: "animated track",
        local: "static track",
        rootCause: "runtime_failure",
        evidence: "Logo track scrollWidth not greater than slider width locally.",
      });
    }

    if (desktopLive.brokenImages !== desktopLocal.brokenImages) {
      addFinding(findings, {
        severity: "P2",
        category: "runtime",
        element: "images",
        live: `${desktopLive.brokenImages} broken`,
        local: `${desktopLocal.brokenImages} broken`,
        rootCause: "runtime_failure",
        evidence: "Broken image count differs between live and local.",
      });
    }

    if (desktopLive.widgets.zeroStatCounters && desktopLocal.widgets.zeroStatCounters) {
      addFinding(findings, {
        severity: "P3",
        category: "content",
        element: "stat counters",
        live: "shows 0%",
        local: "shows 0%",
        rootCause: "live_baseline_bug",
        evidence: "Counter widgets show zero on both live and local.",
      });
    }

    if (desktopLive.widgets.homeLendingCopy && desktopLocal.widgets.homeLendingCopy) {
      addFinding(findings, {
        severity: "P3",
        category: "content",
        element: "masterclass copy",
        live: "home lending products copy present",
        local: "same copy present",
        rootCause: "live_baseline_bug",
        evidence: "Wrong-industry copy exists on both environments.",
      });
    }

    if (!desktopLocal.ghlScriptLoaded && desktopLive.ghlScriptLoaded) {
      addFinding(findings, {
        severity: "P1",
        category: "runtime",
        element: "GHL bundle script",
        live: "loaded",
        local: "missing",
        rootCause: "runtime_failure",
        evidence: "stcdn.leadconnectorhq.com bundle not present in local document.scripts.",
      });
    }

    for (const test of behavioral) {
      if (test.pass) continue;
      addFinding(findings, {
        severity: test.test.includes("video") || test.test.includes("slider") ? "P1" : "P2",
        category: "behavioral",
        element: test.test,
        live: String(test.live),
        local: String(test.local),
        rootCause: test.rootCause,
        evidence: `Behavioral test failed: ${test.test}`,
      });
    }
  }

  const comparableSelectors = KEY_SELECTORS.filter((selector) => selector !== "ghl-root");
  const matchedSelectors = comparableSelectors.filter((selector) => {
    const liveHas =
      selector === "nlca-banner-wrap"
        ? runtime.desktop.live.widgets?.nlcaBannerExists ?? liveStatic.hasSelector[selector]
        : selector === "logoSlider1"
          ? runtime.desktop.live.widgets?.logoSliderExists ?? liveStatic.hasSelector[selector]
          : selector.startsWith("video-")
            ? runtime.desktop.live.ids.includes(selector)
            : liveStatic.hasSelector[selector];
    const localHas =
      selector === "nlca-banner-wrap"
        ? runtime.desktop.local.widgets?.nlcaBannerExists ?? false
        : selector === "logoSlider1"
          ? runtime.desktop.local.widgets?.logoSliderExists ?? false
          : selector.startsWith("video-")
            ? runtime.desktop.local.ids.includes(selector)
            : jsonStatic.hasSelector[selector];
    return liveHas && localHas;
  }).length;
  const parityScore = Math.round(
    (matchedSelectors / Math.max(comparableSelectors.length, 1)) * 100,
  );

  const bySeverity: Record<Severity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
  }

  const behavioralPassRate =
    behavioral.length === 0
      ? "n/a"
      : `${behavioral.filter((test) => test.pass).length}/${behavioral.length}`;

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    slug,
    liveUrl,
    localUrl,
    summary: {
      totalFindings: findings.length,
      bySeverity,
      parityScore,
      behavioralPassRate,
    },
    findings,
    static: {
      live: liveStatic,
      export: exportStatic,
      json: jsonStatic,
      staleness,
      importLoss,
    },
    runtime,
    behavioral,
    recommendedFixes: buildRecommendedFixes(findings),
  };

  const jsonOut = path.join(auditDir, `${slug}-parity-report.json`);
  const mdOut = path.join(auditDir, `${slug === "home" ? "HOME" : slug.toUpperCase()}-PARITY-AUDIT.md`);

  fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2), "utf8");
  fs.writeFileSync(mdOut, renderMarkdown(report), "utf8");

  console.log(`\nAudit complete.`);
  console.log(`JSON: ${jsonOut}`);
  console.log(`Markdown: ${mdOut}`);
  console.log(`Findings: ${findings.length} | Parity score: ${parityScore}%`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
