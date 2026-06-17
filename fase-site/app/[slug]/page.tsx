import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GhlPageClient } from "@/components/ghl/GhlPageClient";
import { getAllSlugs, getPage } from "@/lib/pages";

type PageProps = {
  params: Promise<{ slug: string }>;
};

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);

  if (!page) {
    return {};
  }

  return {
    title: page.metadata.title,
    description: page.metadata.description,
    openGraph: page.metadata.openGraph,
  };
}

export default async function GhlPage({ params }: PageProps) {
  const { slug } = await params;

  if (!getPage(slug)) {
    notFound();
  }

  return <GhlPageClient slug={slug} />;
}
