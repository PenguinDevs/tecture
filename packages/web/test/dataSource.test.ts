import { afterEach, describe, expect, it, vi } from "vitest";
import { createHttpDataSource } from "../src/architecture/dataSource";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

const DRIFT = {
  version: 1,
  generatedAt: "2026-07-06T00:00:00.000Z",
  generator: { name: "evidence.mjs" },
  codegraphSchemaVersion: 6,
  staleIndex: false,
  summary: {
    errors: 0,
    warns: 1,
    infos: 0,
    nodesChecked: 1,
    edgesChecked: 1,
    nodesSkipped: 0,
    edgesSkipped: 0,
  },
  findings: [
    {
      kind: "unverified-edge",
      severity: "warn",
      message: "no symbol edges support a -> b",
    },
  ],
};

describe("createHttpDataSource().loadDrift", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the report on 200 with a report body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(DRIFT))),
    );
    const source = createHttpDataSource();
    await expect(source.loadDrift?.()).resolves.toEqual(DRIFT);
    expect(fetch).toHaveBeenCalledWith("/api/architecture/drift");
  });

  it("returns null on 200 with a null body (no drift.json on disk)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(null))),
    );
    const source = createHttpDataSource();
    await expect(source.loadDrift?.()).resolves.toBeNull();
  });

  it("returns null on a non-OK response instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse({ message: "boom" }, false, 500))),
    );
    const source = createHttpDataSource();
    await expect(source.loadDrift?.()).resolves.toBeNull();
  });

  it("returns null on a network error instead of throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline"))),
    );
    const source = createHttpDataSource();
    await expect(source.loadDrift?.()).resolves.toBeNull();
  });

  it("prefixes the baseUrl", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(jsonResponse(null))),
    );
    const source = createHttpDataSource("/open/user/project/");
    await source.loadDrift?.();
    expect(fetch).toHaveBeenCalledWith(
      "/open/user/project/api/architecture/drift",
    );
  });
});

describe("createHttpDataSource onboarding persistence", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads dismissed state from localStorage and persists changes", async () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });

    const source = createHttpDataSource();
    await expect(source.isOnboardingDismissed?.()).resolves.toBe(false);

    await source.dismissOnboarding?.();
    await expect(source.isOnboardingDismissed?.()).resolves.toBe(true);
    expect(storage.get("tecture:onboarding-dismissed")).toBe("true");
  });

  it("handles storage access errors gracefully without throwing", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    });

    const source = createHttpDataSource();
    await expect(source.isOnboardingDismissed?.()).resolves.toBe(false);
    await expect(source.dismissOnboarding?.()).resolves.toBeUndefined();
  });
});
