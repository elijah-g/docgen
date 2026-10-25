import { NextResponse } from "next/server";
import { devOnlyGuard } from "../../_lib/dev-only";
import { assertStudioRequest } from "../../_lib/security";
import { isSlug, loadWalkthroughById, resolveWalkthroughFile } from "../../_lib/server";

export async function GET(request: Request) {
  const guard = devOnlyGuard();
  if (guard) return guard;
  const security = assertStudioRequest(request);
  if (security) return security;

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !isSlug(id)) return NextResponse.json({ error: "missing or invalid ?id=" }, { status: 400 });

  try {
    const walkthrough = loadWalkthroughById(id);
    const file = resolveWalkthroughFile(id);
    return NextResponse.json({ walkthrough, file });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 404 });
  }
}
