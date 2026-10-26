import { z } from "zod";
import { TargetSchema, BoxSchema } from "./target.js";
import { ActionSchema } from "./action.js";
import { parseDoString } from "./parse-do.js";
import { sectionProblems } from "./placement.js";
import type { Step, Walkthrough } from "./types.js";

const ViewportSchema = z.object({ width: z.number(), height: z.number() }).strict();

const PersonaSchema = z
  .object({
    role: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
    cognitoSub: z.string().optional(),
  })
  .strict();

const StartSchema = z
  .object({
    signed_in_as: z.string().optional(),
    page: z.string().optional(),
    baseUrl: z.string().optional(),
    viewport: ViewportSchema.optional(),
    deviceScaleFactor: z.number().optional(),
    show: z.string().optional(),
    notes: z.string().optional(),
    persona: PersonaSchema.optional(),
  })
  .strict();

const VerifiedAgainstSchema = z
  .object({
    app: z.string().optional(),
    routes: z.array(z.string()).optional(),
    sources: z.array(z.string()).optional(),
  })
  .strict();

const VoiceConfigSchema = z
  .object({
    provider: z.string().optional(),
    model: z.string().optional(),
    voiceId: z.string().optional(),
    speed: z.number().optional(),
    gapSeconds: z.number().optional(),
  })
  .strict();

const TitleCardSchema = z
  .object({
    eyebrow: z.string().optional(),
    title: z.string().optional(),
    subtitle: z.string().optional(),
    say: z.string().optional(),
    caption: z.string().optional(),
    recap: z.array(z.string()).optional(),
  })
  .strict();

const CameraSchema = z.union([
  z.literal("full"),
  z
    .object({
      focus: TargetSchema,
      zoom: z.number().optional(),
      align: z.enum(["top", "right", "left"]).optional(),
    })
    .strict(),
]);

const DatabaseCheckSchema = z
  .object({
    name: z.string(),
    sql: z.string(),
    params: z.array(z.string()).optional(),
    expect: z.record(z.unknown()),
  })
  .strict();

const ValidateSchema = z
  .object({ database: z.array(DatabaseCheckSchema).optional() })
  .strict();

// A callout/blur box pins to exactly one of `target` (resolved to a box from the capture
// manifest at page/render time, so it follows the element when the layout moves) or a fixed
// `box` (viewport CSS-px, the same space `boxOf`/highlight boxes use) — never both, never
// neither, or the Studio/CLI edit actions that write these would have no single source of truth
// for where the box actually is.
const CalloutSchema = z
  .object({
    id: z.string(),
    target: TargetSchema.optional(),
    box: BoxSchema.optional(),
    label: z.string().optional(),
  })
  .strict()
  .refine((c) => Boolean(c.target) !== Boolean(c.box), {
    message: "a callout needs exactly one of `target` or `box`",
  });

const BlurBoxSchema = z
  .object({
    id: z.string(),
    target: TargetSchema.optional(),
    box: BoxSchema.optional(),
  })
  .strict()
  .refine((b) => Boolean(b.target) !== Boolean(b.box), {
    message: "a blur box needs exactly one of `target` or `box`",
  });

/**
 * The raw shape a YAML file may use: short plain-words fields (`do`, `check`)
 * alongside, or instead of, a full `actions:` list. `RawStepSchema.toStep()`
 * (see below) merges these into a Step with a resolved `actions` array.
 */
const RawStepSchema = z
  .object({
    id: z.string().optional(),
    chapter: z.string().optional(),
    title: z.string().optional(),
    do: z.union([z.string(), z.array(z.string())]).optional(),
    say: z.string().optional(),
    caption: z.string().optional(),
    page_text: z.string().optional(),
    check: z.union([z.string(), z.array(z.string())]).optional(),
    mask: z.array(z.string()).optional(),
    camera: CameraSchema.optional(),
    hold: z.number().min(0, "hold must be 0 or more seconds").optional(),
    callouts: z.array(CalloutSchema).optional(),
    blur: z.array(BlurBoxSchema).optional(),
    actions: z.array(ActionSchema).optional(),
  })
  .strict()
  // A step mixing `do`/`check` with `actions:` used to silently run both (rawStepToStep below
  // concatenated them), so an edit meant to replace one left the other's stale/broken actions
  // running too. Reject the ambiguous shape outright instead — a step picks either plain words
  // (`do`/`check`) or a structured `actions:` list, never both.
  .refine((raw) => !((raw.do !== undefined || raw.check !== undefined) && raw.actions !== undefined), {
    message: "a step can't have both `do`/`check` and `actions:` — pick one (use `setStepField` for do/check, `setStepActions` for actions)",
  });

export type RawStep = z.infer<typeof RawStepSchema>;

// The id is used as a path segment (capture/render output dirs, cache paths, etc.), so it's
// restricted to a slug: lowercase letters/digits, starting with one, hyphens as separators.
const WALKTHROUGH_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const WalkthroughDocSchema = z
  .object({
    walkthrough: z
      .string()
      .regex(
        WALKTHROUGH_ID_PATTERN,
        "walkthrough id must be a slug: lowercase letters, digits and hyphens, starting with a letter or digit",
      ),
    version: z.number().optional(),
    title: z.string(),
    summary: z.string().optional(),
    product: z.string().optional(),
    for: z.string().optional(),
    // Where the page sits in the help library: a top-level category ("Getting started") or a
    // feature group inside "How do I…" ("Payments"), nested with " / " — see placement.ts.
    section: z
      .string()
      .superRefine((value, ctx) => {
        for (const message of sectionProblems(value)) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
      })
      .optional(),
    verifiedAgainst: VerifiedAgainstSchema.optional(),
    start: StartSchema.optional(),
    data: z.record(z.unknown()).optional(),
    voice: VoiceConfigSchema.optional(),
    intro: TitleCardSchema.optional(),
    outro: TitleCardSchema.optional(),
    steps: z.array(RawStepSchema).min(1),
    validate: ValidateSchema.optional(),
  })
  .strict();

export type WalkthroughDoc = z.infer<typeof WalkthroughDocSchema>;

/** Turns a step's `do:` / `check:` / `actions:` fields into one action list. */
export function rawStepToStep(raw: RawStep): Step {
  const actions = [];
  for (const doText of toArray(raw.do)) {
    actions.push(...parseDoString(doText));
  }
  for (const checkText of toArray(raw.check)) {
    actions.push(...parseCheck(checkText));
  }
  if (raw.actions) {
    actions.push(...raw.actions);
  }
  return {
    id: raw.id,
    chapter: raw.chapter,
    title: raw.title,
    say: raw.say,
    caption: raw.caption,
    page_text: raw.page_text,
    mask: raw.mask,
    camera: raw.camera,
    hold: raw.hold,
    callouts: raw.callouts,
    blur: raw.blur,
    actions,
  };
}

function parseCheck(checkText: string) {
  const m = checkText.trim().match(/^text\s+"([^"]+)"\s+is\s+visible$/i);
  if (m) {
    return [{ do: "expect" as const, target: { text: m[1] } }];
  }
  // Fall back to the same grammar as `do:` (e.g. `check: expect text "..."`).
  return parseDoString(checkText);
}

function toArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

/** Builds a typed Walkthrough from a validated raw document. */
export function docToWalkthrough(doc: WalkthroughDoc): Walkthrough {
  return {
    walkthrough: doc.walkthrough,
    version: doc.version,
    title: doc.title,
    summary: doc.summary,
    product: doc.product,
    for: doc.for,
    ...(doc.section !== undefined ? { section: doc.section } : {}),
    verifiedAgainst: doc.verifiedAgainst,
    start: doc.start,
    data: doc.data,
    voice: doc.voice,
    intro: doc.intro,
    outro: doc.outro,
    steps: doc.steps.map(rawStepToStep),
    validate: doc.validate,
  };
}
