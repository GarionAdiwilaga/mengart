import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const siteUrl = process.env.NEXTAUTH_URL || "https://mengart.local";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/gallery", "/challenges", "/artists", "/commissions"],
        disallow: [
          "/admin",
          "/admin/*",
          "/me",
          "/me/*",
          "/dashboard",
          "/dashboard/*",
          "/api/*",
          "/login",
          "/register",
          "/forgot-password",
          "/reset-password",
          "/invite/*",
          "/verify-email/*",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
