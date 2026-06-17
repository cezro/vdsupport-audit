import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: "/",
        destination: "/home",
        permanent: true,
      },
      {
        source: "/booking",
        destination: "/discovery-call",
        permanent: true,
      },
      {
        source: "/ncla-squeeze-page-1",
        destination: "/ncla-quiz-funnel",
        permanent: true,
      },
      {
        source: "/service-page-555902",
        destination: "/service-page",
        permanent: true,
      },
      {
        source: "/privacy-policy-page",
        destination: "/privacy-policy",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
