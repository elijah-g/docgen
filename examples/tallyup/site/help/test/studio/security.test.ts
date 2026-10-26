import { afterEach, describe, expect, it } from "vitest";
import { assertStudioRequest, getStudioToken, STUDIO_TOKEN_HEADER } from "../../app/studio/_lib/security";

function req(host: string, origin?: string): Request {
  const headers: Record<string, string> = { host, [STUDIO_TOKEN_HEADER]: getStudioToken() };
  if (origin) headers.origin = origin;
  return new Request(`http://${host}/studio/api/walkthroughs`, { headers });
}

describe("assertStudioRequest host allowlist", () => {
  afterEach(() => {
    delete process.env.DOCGEN_STUDIO_ALLOWED_HOSTS;
  });

  it("accepts localhost", () => {
    expect(assertStudioRequest(req("localhost:3001", "http://localhost:3001"))).toBeNull();
  });

  it("refuses another host by default", () => {
    expect(assertStudioRequest(req("dev.example.com", "https://dev.example.com"))?.status).toBe(403);
  });

  it("accepts a host listed in DOCGEN_STUDIO_ALLOWED_HOSTS, case-insensitively", () => {
    process.env.DOCGEN_STUDIO_ALLOWED_HOSTS = "Dev.Example.com, other.example.com";
    expect(assertStudioRequest(req("dev.example.com", "https://dev.example.com"))).toBeNull();
  });

  it("still refuses an unlisted origin when the host is allowed", () => {
    process.env.DOCGEN_STUDIO_ALLOWED_HOSTS = "dev.example.com";
    expect(assertStudioRequest(req("dev.example.com", "https://evil.example.net"))?.status).toBe(403);
  });

  it("still requires the Studio token on an allowed host", () => {
    process.env.DOCGEN_STUDIO_ALLOWED_HOSTS = "dev.example.com";
    const r = new Request("http://dev.example.com/studio/api/walkthroughs", {
      headers: { host: "dev.example.com", origin: "https://dev.example.com", [STUDIO_TOKEN_HEADER]: "wrong" },
    });
    expect(assertStudioRequest(r)?.status).toBe(403);
  });
});
