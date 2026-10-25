import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { appName } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: appName,
    },
    // The default Ctrl+K trigger opens fumadocs-ui's own search dialog, which needs a server
    // API route this app doesn't have (see app/layout.tsx's RootProvider `search: { enabled:
    // false }`) — hide the dead button too, rather than leave one that does nothing when
    // clicked. The real search UI is components/search-box.tsx's SearchBox, rendered in
    // app/(site)/layout.tsx.
    searchToggle: { enabled: false },
  };
}
