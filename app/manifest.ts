import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SimpleCity",
    short_name: "SimpleCity",
    description: "Local decisions, translated into plain-English civic action cards.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f8fafb",
    theme_color: "#2457a6",
    categories: ["government", "news", "productivity"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any"
      },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable"
      }
    ],
    shortcuts: [
      {
        name: "Decisions",
        short_name: "Decisions",
        description: "Browse local government decision summaries.",
        url: "/decisions",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      },
      {
        name: "Meetings",
        short_name: "Meetings",
        description: "Browse collected public meetings.",
        url: "/meetings",
        icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }]
      }
    ]
  };
}
