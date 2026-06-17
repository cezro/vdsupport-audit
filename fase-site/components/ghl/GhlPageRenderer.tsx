"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { GhlHeadScript, GhlPageData } from "@/lib/types";
import { scheduleAnimationFallback } from "@/lib/ghl-animation-fallback";

function isCloudflareScript(src: string | undefined): boolean {
  return Boolean(src?.includes("cloudflareinsights.com"));
}

function loadExternalScript(
  scriptDef: GhlHeadScript,
): Promise<HTMLScriptElement> {
  return new Promise((resolve) => {
    const existing = document.querySelector(
      `script[src="${scriptDef.src}"]`,
    ) as HTMLScriptElement | null;
    if (existing) {
      resolve(existing);
      return;
    }

    const script = document.createElement("script");
    script.src = scriptDef.src;
    script.async = scriptDef.async ?? false;
    if (scriptDef.type) {
      script.type = scriptDef.type;
    }
    script.setAttribute("data-ghl-injected", "true");
    script.onload = () => resolve(script);
    script.onerror = () => resolve(script);
    document.body.appendChild(script);
  });
}

function runInlineScript(code: string): HTMLScriptElement {
  const script = document.createElement("script");
  script.textContent = code;
  script.setAttribute("data-ghl-injected", "true");
  document.body.appendChild(script);
  return script;
}

function injectNuxtPayload(
  container: HTMLElement,
  payload: string,
): HTMLScriptElement {
  const existing = document.getElementById("__NUXT_DATA__");
  if (existing) {
    existing.remove();
  }

  const script = document.createElement("script");
  script.id = "__NUXT_DATA__";
  script.type = "application/json";
  script.textContent = payload;
  script.setAttribute("data-ghl-injected", "true");
  container.appendChild(script);
  return script;
}

function injectHeadAssets(page: GhlPageData): () => void {
  const cleanupNodes: HTMLElement[] = [];

  for (const href of page.preconnectHrefs) {
    if (document.querySelector(`link[rel="preconnect"][href="${href}"]`)) {
      continue;
    }

    const link = document.createElement("link");
    link.rel = "preconnect";
    link.href = href;
    link.crossOrigin = "anonymous";
    link.setAttribute("data-ghl-injected", "true");
    document.head.appendChild(link);
    cleanupNodes.push(link);
  }

  for (const href of page.stylesheetHrefs) {
    if (document.querySelector(`link[rel="stylesheet"][href="${href}"]`)) {
      continue;
    }

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.setAttribute("data-ghl-injected", "true");
    document.head.appendChild(link);
    cleanupNodes.push(link);
  }

  if (page.styles) {
    const style = document.createElement("style");
    style.setAttribute("data-ghl-page", page.slug);
    style.setAttribute("data-ghl-injected", "true");
    style.textContent = page.styles;
    document.head.appendChild(style);
    cleanupNodes.push(style);
  }

  return () => {
    for (const node of cleanupNodes) {
      node.remove();
    }
  };
}

function cleanupInjectedScripts(): void {
  for (const node of document.querySelectorAll("[data-ghl-injected]")) {
    node.remove();
  }
}

export function GhlPageRenderer({ slug }: { slug: string }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState<GhlPageData | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/pages/${slug}.json`)
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Failed to load page data for ${slug}`);
        }
        return response.json() as Promise<GhlPageData>;
      })
      .then((data) => {
        if (!cancelled) {
          setPage(data);
        }
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!page || !root) {
      return;
    }

    const currentPage = page;
    const mountRoot = root;
    const cleanupHead = injectHeadAssets(currentPage);

    let cancelled = false;
    let cancelAnimationFallback: (() => void) | undefined;

    async function hydratePage() {
      const nonModuleHeadScripts = currentPage.headScripts.filter(
        (script) => script.type !== "module" && !isCloudflareScript(script.src),
      );
      const moduleHeadScripts = currentPage.headScripts.filter(
        (script) => script.type === "module",
      );

      for (const scriptDef of nonModuleHeadScripts) {
        if (cancelled) {
          return;
        }
        await loadExternalScript(scriptDef);
      }

      if (cancelled) {
        return;
      }

      mountRoot.innerHTML = currentPage.bodyHtml;

      for (const script of currentPage.bodyScripts) {
        if (cancelled) {
          return;
        }

        if (script.src) {
          if (isCloudflareScript(script.src)) {
            continue;
          }
          await loadExternalScript({
            src: script.src,
            type: script.type,
            async: false,
          });
          continue;
        }

        if (script.code?.trim()) {
          runInlineScript(script.code);
        }
      }

      if (cancelled) {
        return;
      }

      if (currentPage.nuxtConfig) {
        runInlineScript(currentPage.nuxtConfig);
      }

      if (cancelled) {
        return;
      }

      if (currentPage.nuxtPayload) {
        injectNuxtPayload(mountRoot, currentPage.nuxtPayload);
      }

      for (const scriptDef of moduleHeadScripts) {
        if (cancelled) {
          return;
        }
        await loadExternalScript(scriptDef);
      }

      if (cancelled) {
        return;
      }

      cancelAnimationFallback = scheduleAnimationFallback(mountRoot);
    }

    void hydratePage();

    return () => {
      cancelled = true;
      cancelAnimationFallback?.();
      cleanupHead();
      cleanupInjectedScripts();
      mountRoot.innerHTML = "";
    };
  }, [page]);

  return (
    <div
      id="ghl-root"
      ref={rootRef}
      suppressHydrationWarning
      style={{ display: "contents" }}
    />
  );
}
