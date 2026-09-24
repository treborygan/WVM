import packageJson from "../../package.json";
import packageLock from "../../package-lock.json";
import { describe, expect, it } from "vitest";

const manifest = packageJson as unknown as {
  engines?: { node?: string };
  devEngines?: {
    runtime?: { name?: string; version?: string; onFail?: string };
  };
};

const lockfile = packageLock as unknown as {
  packages: Record<string, { engines?: { node?: string } }>;
};

describe("Node toolchain constraints", () => {
  it("enforces the Node range required by the pinned jsdom version", () => {
    const jsdomNodeRange = lockfile.packages["node_modules/jsdom"]?.engines?.node;

    expect(jsdomNodeRange).toBeDefined();
    expect(manifest.engines?.node).toBe(jsdomNodeRange);
    expect(manifest.devEngines?.runtime).toEqual({
      name: "node",
      version: jsdomNodeRange,
      onFail: "error",
    });
    expect(lockfile.packages[""]?.engines?.node).toBe(jsdomNodeRange);
  });
});
