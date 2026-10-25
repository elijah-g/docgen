// Site-wide constants. `appName` and `gitConfig` are placeholders `docgen init`
// overwrites from the detected app repo; everything else stays as-is.
export const appName = "Help";
export const siteRoute = "";

export const siteSections = [
  { slug: "getting-started", title: "Getting started" },
  { slug: "how-do-i", title: "How do I…" },
  { slug: "screens-and-settings", title: "Screens and settings" },
  { slug: "words-we-use", title: "Words we use" },
  { slug: "troubleshooting-and-faq", title: "Troubleshooting and FAQ" },
  { slug: "whats-new", title: "What's new" },
] as const;
