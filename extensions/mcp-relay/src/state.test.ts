import { createPrivateKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createStateFixture } from "./relay.test-helpers.js";

describe("MCP relay persisted state parsing", () => {
  it("keeps its Ed25519 identity across restart and refuses a different relay", async () => {
    const f = createStateFixture();
    const identity = await f.open().initialize();
    expect(
      createPrivateKey({
        key: Buffer.from(identity.privateKey, "base64url"),
        type: "pkcs8",
        format: "der",
      }).asymmetricKeyType,
    ).toBe("ed25519");
    await expect(f.open().initialize()).resolves.toEqual(identity);
    const saved = f.persisted();
    await expect(f.open("https://other.example").initialize()).rejects.toThrow("bound to");
    expect(f.persisted()).toBe(saved);
  });

  it("preserves invalid state and storage failures for operator recovery", async () => {
    const f = createStateFixture();
    await f.open().initialize();
    const saved = f.persisted();
    f.effects.failure = new Error("Storage unavailable");
    await expect(f.open().initialize()).rejects.toThrow("Storage unavailable");
    expect(f.persisted()).toBe(saved);
    f.effects.failure = undefined;
    for (const value of [
      null,
      { relayOrigin: "https://mcp.openclaw.ai", privateKey: "invalid-key" },
    ]) {
      f.seed(value);
      const invalid = f.persisted();
      await expect(f.open().initialize()).rejects.toThrow("Restore a valid OpenClaw state backup");
      expect(f.persisted()).toBe(invalid);
    }
  });
});
