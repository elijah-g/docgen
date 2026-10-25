import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { baseOptions } from "@/lib/layout.shared";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { SearchBox } from "@/components/search-box";
import { VersionSwitcher } from "@/components/version-switcher";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <DocsLayout tree={source.getPageTree()} {...baseOptions()}>
      {/* fumadocs-ui's own search dialog is disabled (lib/layout.shared.tsx) — this is the
       * real search UI: client-side over public/search-index.json, works on a static export. */}
      <div className="mx-auto flex w-full max-w-fd-container items-center justify-between gap-4 px-4 pt-4">
        <SearchBox />
        {/* Version switcher (build-plan.md M21 step 2): no-ops when nothing's been frozen yet
         * (versions.json doesn't exist). This "latest" route never changes — it only offers a
         * link sideways into /v/<name>/... */}
        <VersionSwitcher />
      </div>
      {children}
      {/* scope.md "Help chat": "On the site and as a drop-in widget inside the app" — this is
       * the site's own copy; public/widget.js is the drop-in for the user's app. If the owner
       * hasn't set ANTHROPIC_API_KEY, /api/chat answers 503 and the widget shows that message
       * inline — the rest of the site is unaffected either way. */}
      <ChatWidget />
    </DocsLayout>
  );
}
