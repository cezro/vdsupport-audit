import fs from "fs";

import path from "path";

import * as cheerio from "cheerio";

import { CANONICAL_PAGES } from "../lib/pages-manifest";

import type {

  GhlBodyScript,

  GhlHeadScript,

  GhlPageData,

  GhlPageMetadata,

} from "../lib/types";



const HTML_DIR = path.resolve(

  __dirname,

  "../../fase-github-export/site-export/html",

);

const OUTPUT_DIR = path.resolve(__dirname, "../content/pages");

const PUBLIC_OUTPUT_DIR = path.resolve(__dirname, "../public/pages");



const DUPLICATE_REDIRECTS: Record<string, string> = {

  "/booking": "/discovery-call",

  "/ncla-squeeze-page-1": "/ncla-quiz-funnel",

  "/service-page-555902": "/service-page",

  "/privacy-policy-page": "/privacy-policy",

};



function normalizePath(pathname: string): string {

  if (!pathname || pathname === "/") {

    return "/";

  }



  const trimmed = pathname.replace(/\/+$/, "");

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;

}



function rewriteCanonicalPath(pathname: string): string {

  const normalized = normalizePath(pathname);

  return DUPLICATE_REDIRECTS[normalized] ?? normalized;

}



function rewriteUrls(content: string): string {

  let result = content.replace(

    /https?:\/\/(?:www\.)?fullarchsalesexperts\.com\/(#section-[^"'`\s>]+)/gi,

    (_, hash: string) => `/home${hash}`,

  );



  result = result.replace(

    /https?:\/\/(?:www\.)?fullarchsalesexperts\.com(\/[^"'`\s>#]*)?/gi,

    (_, rawPath = "") => rewriteCanonicalPath(rawPath || "/"),

  );



  result = result.replace(

    /REPORT_PAGE_URL\s*=\s*['"][^'"]*['"]/g,

    "REPORT_PAGE_URL = '/ncla-result-page'",

  );



  for (const [from, to] of Object.entries(DUPLICATE_REDIRECTS)) {

    result = result.replaceAll(`href="${from}"`, `href="${to}"`);

    result = result.replaceAll(`href='${from}'`, `href='${to}'`);

  }



  result = result.replaceAll('href="/result-page"', 'href="/ncla-result-page"');

  result = result.replaceAll("href='/result-page'", "href='/ncla-result-page'");

  result = result.replace(/href="\/(#section-[^"]+)"/g, 'href="/home$1"');

  result = result.replace(/href='\/(#section-[^']+)'/g, "href='/home$1'");



  return result;

}



function unique(values: string[]): string[] {

  return [...new Set(values.filter(Boolean))];

}



function isCloudflareScript(src: string | undefined): boolean {

  return Boolean(src?.includes("cloudflareinsights.com"));

}



function extractMetadata($: cheerio.CheerioAPI): GhlPageMetadata {

  const title = $("title").first().text().trim() || undefined;

  const description =

    $('meta[name="description"]').attr("content")?.trim() || undefined;



  const openGraph = {

    title: $('meta[property="og:title"]').attr("content")?.trim(),

    description: $('meta[property="og:description"]').attr("content")?.trim(),

    image: $('meta[property="og:image"]').attr("content")?.trim(),

    url: $('meta[property="og:url"]').attr("content")?.trim(),

  };



  const hasOpenGraph = Object.values(openGraph).some(Boolean);



  return {

    title,

    description,

    openGraph: hasOpenGraph ? openGraph : undefined,

  };

}



function extractHeadScripts($: cheerio.CheerioAPI): GhlHeadScript[] {
  const scripts: GhlHeadScript[] = [];

  $("head script[src]").each((_, element) => {
    const el = $(element);
    const src = el.attr("src") ?? "";
    if (!src || isCloudflareScript(src)) {
      return;
    }

    scripts.push({
      src,
      type: el.attr("type") ?? undefined,
      async: el.attr("async") !== undefined,
    });
  });

  return scripts;
}



function extractBodyScripts($: cheerio.CheerioAPI): {

  bodyScripts: GhlBodyScript[];

  nuxtConfig?: string;

  nuxtPayload?: string;

} {

  const bodyScripts: GhlBodyScript[] = [];

  let nuxtConfig: string | undefined;

  let nuxtPayload: string | undefined;



  $("body script").each((_, element) => {

    const el = $(element);

    const src = el.attr("src") ?? undefined;

    const id = el.attr("id") ?? undefined;

    const type = el.attr("type") ?? undefined;

    const code = el.html() ?? "";



    if (id === "__NUXT_DATA__" && type === "application/json") {

      nuxtPayload = code;

      return;

    }



    if (!src && code.includes("window.__NUXT__")) {

      nuxtConfig = code;

      return;

    }



    if (isCloudflareScript(src)) {

      return;

    }



    bodyScripts.push({

      src,

      type,

      id,

      code: src ? undefined : code || undefined,

    });

  });



  return { bodyScripts, nuxtConfig, nuxtPayload };

}



function importPage(slug: string, fileName: string): GhlPageData {

  const htmlPath = path.join(HTML_DIR, fileName);

  if (!fs.existsSync(htmlPath)) {

    throw new Error(`Missing HTML source file: ${htmlPath}`);

  }



  const rawHtml = fs.readFileSync(htmlPath, "utf8");

  const html = rewriteUrls(rawHtml);

  const $ = cheerio.load(html);



  const metadata = extractMetadata($);



  const styles = $("head style")

    .map((_, element) => $(element).html() ?? "")

    .get()

    .join("\n");



  const stylesheetHrefs = unique(

    $("head link[rel='stylesheet']")

      .map((_, element) => $(element).attr("href") ?? "")

      .get(),

  );



  const preconnectHrefs = unique(

    $("head link[rel='preconnect']")

      .map((_, element) => $(element).attr("href") ?? "")

      .get(),

  );



  const headScripts = extractHeadScripts($);

  const { bodyScripts, nuxtConfig, nuxtPayload } = extractBodyScripts($);



  $("body script").remove();

  const bodyHtml = rewriteUrls($("body").html() ?? "");



  return {

    slug,

    metadata,

    styles: rewriteUrls(styles),

    stylesheetHrefs,

    preconnectHrefs,

    headScripts,

    bodyScripts: bodyScripts.map((script) => ({

      ...script,

      code: script.code ? rewriteUrls(script.code) : undefined,

    })),

    nuxtConfig: nuxtConfig ? rewriteUrls(nuxtConfig) : undefined,

    nuxtPayload,

    bodyHtml,

  };

}



function main() {

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  fs.mkdirSync(PUBLIC_OUTPUT_DIR, { recursive: true });



  for (const { slug, file } of CANONICAL_PAGES) {

    const page = importPage(slug, file);

    const serialized = JSON.stringify(page);

    const outputPath = path.join(OUTPUT_DIR, `${slug}.json`);

    const publicOutputPath = path.join(PUBLIC_OUTPUT_DIR, `${slug}.json`);



    fs.writeFileSync(outputPath, serialized, "utf8");

    fs.writeFileSync(publicOutputPath, serialized, "utf8");

    console.log(`Imported ${slug} -> ${path.relative(process.cwd(), outputPath)}`);

  }



  console.log(`\nImported ${CANONICAL_PAGES.length} pages into ${OUTPUT_DIR}`);

}



main();


