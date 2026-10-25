import { NextResponse } from "next/server";
import { devOnlyGuard } from "../../_lib/dev-only";
import { assertStudioRequest } from "../../_lib/security";
import { isSlug, readPageText } from "../../_lib/server";
import { stripMarkers } from "docgen/dist/pages/markers.js";

export async function GET(request: Request) {
  const guard = devOnlyGuard();
  if (guard) return guard;
  const security = assertStudioRequest(request);
  if (security) return security;

  const id = new URL(request.url).searchParams.get("id");
  if (!id || !isSlug(id)) return NextResponse.json({ error: "missing or invalid ?id=" }, { status: 400 });

  const { file, text } = readPageText(id);
  if (!file || text === undefined) {
    return NextResponse.json({ found: false });
  }
  return NextResponse.json({ found: true, file, text, plain: stripMarkers(text) });
}
