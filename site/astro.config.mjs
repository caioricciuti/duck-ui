// docs.duckui.com. The landing page is src/pages/index.astro; everything under
// /docs/ is Markdown in src/content/docs/docs, and /privacy/ and /legal/ are
// Starlight pages without a sidebar entry. The app itself is duckui.com.
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  site: "https://docs.duckui.com",
  redirects: {
    "/examples": "/docs/examples/",
  },
  integrations: [
    starlight({
      title: "Duck-UI",
      description: "DuckDB in your browser: SQL editor, notebooks, dashboards and charts, no server.",
      logo: { src: "./src/assets/logo.png", replacesTitle: false },
      favicon: "/favicon.ico",
      // Page views, cookieless, on the self-hosted Umami. The landing page
      // carries the same tag in src/layouts/Landing.astro.
      head: [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: "https://a.caioricciuti.com/b.js",
            "data-website-id": "c7039b57-0217-4a95-b592-9523077c9cab",
          },
        },
      ],
      social: [
        { icon: "github", label: "GitHub", href: "https://github.com/caioricciuti/duck-ui" },
      ],
      components: {
        SocialIcons: "./src/components/HeaderLinks.astro",
      },
      customCss: ["./src/styles/custom.css"],
      expressiveCode: {
        themes: ["github-dark-dimmed", "github-light"],
        styleOverrides: {
          borderRadius: "8px",
          borderColor: "var(--duck-frame)",
          codeFontFamily: "var(--sl-font-mono)",
          uiFontFamily: "var(--sl-font)",
          frames: {
            shadowColor: "transparent",
          },
        },
      },
      sidebar: [
        {
          label: "Start here",
          items: [
            { label: "Introduction", slug: "docs" },
            { label: "Getting started", slug: "docs/getting-started" },
            { label: "Examples", slug: "docs/examples" },
          ],
        },
        {
          label: "Features",
          items: [
            { label: "Duck Brain", slug: "docs/duck-brain" },
            { label: "Folder access", slug: "docs/folder-access" },
            { label: "Dashboards", slug: "docs/dashboards" },
            { label: "Live sessions", slug: "docs/live-sessions" },
            { label: "Charts", slug: "docs/charts" },
            { label: "Embedding", slug: "docs/embedding" },
            { label: "Environment variables", slug: "docs/environment-variables" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Troubleshooting", slug: "docs/troubleshooting" },
            { label: "Ecosystem", slug: "docs/ecosystem" },
            { label: "Acknowledgments", slug: "docs/acknowledgments" },
            { label: "License", slug: "docs/license" },
          ],
        },
      ],
      lastUpdated: false,
      pagination: true,
    }),
  ],
});
