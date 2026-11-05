import type { MetadataRoute } from "next";

/** Club CRM / staging host must not be crawled. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      disallow: "/",
    },
  };
}
