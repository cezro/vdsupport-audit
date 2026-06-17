import fs from "fs";
import path from "path";
import type { GhlPageData } from "./types";
import { PAGE_SLUGS, type PageSlug } from "./pages-manifest";

const CONTENT_DIR = path.join(process.cwd(), "content", "pages");

export function getAllSlugs(): PageSlug[] {
  return PAGE_SLUGS;
}

export function getPage(slug: string): GhlPageData | null {
  const filePath = path.join(CONTENT_DIR, `${slug}.json`);
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as GhlPageData;
}
