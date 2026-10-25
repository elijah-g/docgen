import type { WalkthroughDoc } from "./schema.js";

/**
 * Converts a TallyUp v0 `workflow.json` object into our walkthrough-doc shape
 * (the same shape `loadWalkthroughText` accepts), keeping every field —
 * nothing in workflow.json is dropped. Field renames only: `id`→`walkthrough`,
 * `audience`→`for`, `environment`→`start`, step `voice`→`say`,
 * step `doc`→`page_text`.
 */
export function convertTallyupWorkflow(raw: any): WalkthroughDoc {
  const env = raw.environment ?? {};
  const persona = env.persona ?? {};

  const doc: WalkthroughDoc = {
    walkthrough: raw.id,
    version: raw.version,
    title: raw.title,
    summary: raw.summary,
    product: raw.product,
    for: raw.audience,
    verifiedAgainst: raw.verifiedAgainst,
    start: {
      signed_in_as: persona.role,
      page: env.startPath,
      baseUrl: env.baseUrl,
      viewport: env.viewport,
      deviceScaleFactor: env.deviceScaleFactor,
      show: env.show,
      notes: env.notes,
      persona:
        persona.name || persona.email || persona.cognitoSub || persona.role
          ? persona
          : undefined,
    },
    data: raw.data,
    voice: raw.voice,
    intro: raw.intro
      ? {
          eyebrow: raw.intro.eyebrow,
          title: raw.intro.title,
          subtitle: raw.intro.subtitle,
          say: raw.intro.voice,
          caption: raw.intro.caption,
        }
      : undefined,
    outro: raw.outro
      ? {
          title: raw.outro.title,
          recap: raw.outro.recap,
          say: raw.outro.voice,
          caption: raw.outro.caption,
        }
      : undefined,
    steps: (raw.steps ?? []).map((step: any) => ({
      id: step.id,
      chapter: step.chapter,
      title: step.title,
      say: step.voice,
      caption: step.caption,
      page_text: step.doc,
      camera: step.camera,
      actions: step.actions,
    })),
    validate: raw.validate,
  };

  return stripUndefined(doc) as WalkthroughDoc;
}

function stripUndefined(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripUndefined);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (v !== undefined) out[k] = stripUndefined(v);
    }
    return out;
  }
  return value;
}
