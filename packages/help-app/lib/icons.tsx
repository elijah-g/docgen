// Icons for the library's fixed top-level categories (docs/scope.md "Help site"). Sections the
// engine creates inside "How do I…" get no icon — their titles carry them.
import { BookOpen, CircleHelp, LayoutPanelTop, ListChecks, Rocket, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

const CATEGORY_ICONS: Record<string, ReactNode> = {
  "getting-started": <Rocket />,
  "how-do-i": <ListChecks />,
  "screens-and-settings": <LayoutPanelTop />,
  "words-we-use": <BookOpen />,
  "troubleshooting-and-faq": <CircleHelp />,
  "whats-new": <Sparkles />,
};

/** Icon for a top-level category folder (`$ref.folder` is its path under content/docs). */
export function categoryIcon(folderPath: string | undefined): ReactNode | undefined {
  return folderPath ? CATEGORY_ICONS[folderPath] : undefined;
}
