// The app's brand as the help site sees it. `lib/brand.json` and `app/brand.css` are written by
// the docgen engine from docgen.config's `brand` (`docgen theme`, and every `docgen build`), so
// the site, Studio, videos and PDFs all match the app they document. Don't edit them by hand.
import raw from "./brand.json";

export interface Brand {
  /** Product name, e.g. "TallyUp". "Help" when unknown. */
  name: string;
  /** Site URLs under /brand/, or null. */
  logo: string | null;
  logoDark: string | null;
  icon: string | null;
  /** Stylesheet that loads the brand font, or null. */
  fontUrl: string | null;
}

const data = raw as Partial<Brand>;

export const brand: Brand = {
  name: data.name?.trim() || "Help",
  logo: data.logo ?? null,
  logoDark: data.logoDark ?? null,
  icon: data.icon ?? null,
  fontUrl: data.fontUrl ?? null,
};

/** "TallyUp Help", or just "Help" when the product name is unknown. */
export const siteTitle = brand.name === "Help" ? "Help" : `${brand.name} Help`;
