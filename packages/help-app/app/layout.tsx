import { RootProvider } from "fumadocs-ui/provider/next";
import "./globals.css";

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="flex min-h-screen flex-col">
        {/* fumadocs-ui's own Ctrl+K search dialog expects a server search API route (e.g.
         * `/api/search`) that this app never defines — on any host, not just a static export,
         * it always rendered "Search failed". scope.md's search is a built-in client-side index
         * (`public/search-index.json`, no database) via components/search-box.tsx's SearchBox,
         * not fumadocs' dialog, so disable the latter outright rather than leave a broken
         * Ctrl+K sitting on every page (caught by actually using the search UI in a browser). */}
        <RootProvider search={{ enabled: false }}>{children}</RootProvider>
      </body>
    </html>
  );
}
