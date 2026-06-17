"use client";

import dynamic from "next/dynamic";

const GhlPageRenderer = dynamic(
  () =>
    import("@/components/ghl/GhlPageRenderer").then(
      (module) => module.GhlPageRenderer,
    ),
  { ssr: false },
);

export function GhlPageClient({ slug }: { slug: string }) {
  return <GhlPageRenderer slug={slug} />;
}
