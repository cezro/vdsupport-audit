export type GhlPageMetadata = {

  title?: string;

  description?: string;

  openGraph?: {

    title?: string;

    description?: string;

    image?: string;

    url?: string;

  };

};



export type GhlHeadScript = {

  src: string;

  type?: string;

  async?: boolean;

};



export type GhlBodyScript = {

  src?: string;

  type?: string;

  id?: string;

  code?: string;

};



export type GhlPageData = {

  slug: string;

  metadata: GhlPageMetadata;

  styles: string;

  stylesheetHrefs: string[];

  preconnectHrefs: string[];

  headScripts: GhlHeadScript[];

  bodyScripts: GhlBodyScript[];

  nuxtConfig?: string;

  nuxtPayload?: string;

  bodyHtml: string;

};



export function getExternalScriptUrls(page: GhlPageData): string[] {

  const urls = [

    ...page.headScripts.map((script) => script.src),

    ...page.bodyScripts

      .map((script) => script.src)

      .filter((src): src is string => Boolean(src)),

  ];

  return [...new Set(urls.filter(Boolean))];

}



export function getInlineScriptBodies(page: GhlPageData): string[] {

  const scripts: string[] = [];

  if (page.nuxtConfig) {

    scripts.push(page.nuxtConfig);

  }

  if (page.nuxtPayload) {

    scripts.push(page.nuxtPayload);

  }

  for (const script of page.bodyScripts) {

    if (script.code?.trim()) {

      scripts.push(script.code);

    }

  }

  return scripts;

}


