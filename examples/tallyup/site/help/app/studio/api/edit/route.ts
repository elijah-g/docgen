// POST /studio/api/edit — the Studio's "Save" calls land here, then straight into the engine's
// shared edit actions (docs/scope.md: "Studio buttons, the agent, the CLI... all use the same
// small set of actions"). Edits made through the Studio are always `by: "person"`.
import { NextResponse } from "next/server";
import {
  EditLockedError,
  EditValidationError,
  removeStep,
  reorderSteps,
  setPageBlock,
  setStepField,
  type StepField,
} from "docgen/dist/edit/index.js";
import { devOnlyGuard } from "../../_lib/dev-only";
import { assertSlug, pagesDir, pageFileFor, resolveWalkthroughFile } from "../../_lib/server";
import { assertStudioRequest } from "../../_lib/security";

interface EditBody {
  action: "setStepField" | "reorderSteps" | "removeStep" | "setPageBlock";
  walkthroughId?: string;
  stepId?: string;
  field?: StepField;
  value?: string | number;
  newOrder?: string[];
  key?: string;
  text?: string;
}

export async function POST(request: Request) {
  const guard = devOnlyGuard();
  if (guard) return guard;
  const security = assertStudioRequest(request);
  if (security) return security;

  let body: EditBody;
  try {
    body = (await request.json()) as EditBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const result = dispatch(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof EditLockedError ? 423 : err instanceof EditValidationError ? 422 : 400;
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status });
  }
}

function dispatch(body: EditBody) {
  switch (body.action) {
    case "setStepField": {
      if (!body.walkthroughId || !body.stepId || !body.field || body.value === undefined) {
        throw new Error("setStepField requires walkthroughId, stepId, field and value");
      }
      assertSlug(body.walkthroughId);
      const file = resolveWalkthroughFile(body.walkthroughId);
      return setStepField(file, body.stepId, body.field, body.value, { by: "person" });
    }
    case "reorderSteps": {
      if (!body.walkthroughId || !body.newOrder) throw new Error("reorderSteps requires walkthroughId and newOrder");
      assertSlug(body.walkthroughId);
      const file = resolveWalkthroughFile(body.walkthroughId);
      return reorderSteps(file, body.newOrder, { by: "person" });
    }
    case "removeStep": {
      if (!body.walkthroughId || !body.stepId) throw new Error("removeStep requires walkthroughId and stepId");
      assertSlug(body.walkthroughId);
      const file = resolveWalkthroughFile(body.walkthroughId);
      return removeStep(file, body.stepId, { by: "person" });
    }
    case "setPageBlock": {
      // The file to write is never taken from the request — only a walkthrough id, resolved
      // server-side to the one page file docgen built for it (see pageFileFor). This is what
      // stops a cross-site request from naming an arbitrary file (e.g. app/api/chat/route.ts).
      if (!body.walkthroughId || !body.key || body.text === undefined) {
        throw new Error("setPageBlock requires walkthroughId, key and text");
      }
      assertSlug(body.walkthroughId);
      const file = pageFileFor(body.walkthroughId);
      if (!file) throw new Error(`no built page for walkthrough "${body.walkthroughId}"`);
      return setPageBlock(file, body.key, body.text, { by: "person", pagesDir: pagesDir() });
    }
    default:
      throw new Error(`unknown action "${(body as { action?: string }).action}"`);
  }
}
