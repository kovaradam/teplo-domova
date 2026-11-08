// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import cloudflare from "@astrojs/cloudflare";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import { SITE_URL } from "./src/consts.ts";

export default defineConfig({
  site: SITE_URL,
  output: "server",
  // Sessions are kept in D1 by the app (src/lib/session.ts), not in Astro's KV-backed sessions
  adapter: cloudflare({ imageService: "passthrough" }),
  session: false,
  integrations: [react()],
  fonts: [
    {
      name: "Inter",
      cssVariable: "--font-inter",
      provider: fontProviders.local(),
      options: {
        variants: [
          {
            weight: 400,
            style: "normal",
            src: ["./src/assets/fonts/inter-regular.woff2"],
          },
        ],
      },
    },
    {
      name: "Geist Pixel",
      cssVariable: "--font-geist-pixel",
      provider: fontProviders.local(),
      fallbacks: ["ui-monospace", "monospace"],
      options: {
        variants: [
          {
            weight: 400,
            style: "normal",
            src: [
              "./node_modules/@fontsource/geist-pixel/files/geist-pixel-latin-400-normal.woff2",
            ],
          },
        ],
      },
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    // Pre-bundled at startup: found later, Vite re-optimizes mid-request and React breaks (Invalid hook call)
    ssr: { optimizeDeps: { include: ["loading-dev"] } },
  },
});
