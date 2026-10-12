import { createPrivateKey } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RelayGrantAuthority } from "./state.js";
import { createStateFixture } from "./state.test-helpers.js";

const CLIENT = { id: "synthetic-client", name: "Synthetic client" };
const OWNER_AUTHORITY: RelayGrantAuthority = {
  principal: { kind: "owner" },
  ceiling: ["operator.read", "operator.write"],
};
const PERSON_AUTHORITY: RelayGrantAuthority = {
  principal: { kind: "person", profileId: "person-one" },
  principalLabel: "Synthetic person",
  ceiling: ["operator.admin"],
};
const GRANT = {
  grantId: "gr_one",
  clientId: CLIENT.id,
  clientName: CLIENT.name,
  createdAt: 10,
  ...OWNER_AUTHORITY,
};
const PAIR = { grantId: GRANT.grantId, codeHash: "pair-hash", client: CLIENT };

async function paired(f: ReturnType<typeof createStateFixture>) {
  const state = f.open();
  await state.initialize();
  await state.issue(PAIR.codeHash, 1_000, 0);
  await state.createGrant(PAIR, 10);
  return state;
}

describe("MCP relay durable authority", () => {
  it("keeps one Ed25519 identity across concurrent startup and restart, bound to its relay", async () => {
    const f = createStateFixture();
    const identities = await Promise.all([f.open().initialize(), f.open().initialize()]);
    expect(identities[0]).toEqual(identities[1]);
    expect(
      createPrivateKey({
        key: Buffer.from(identities[0].privateKey, "base64url"),
        type: "pkcs8",
        format: "der",
      }).asymmetricKeyType,
    ).toBe("ed25519");
    await expect(f.open().initialize()).resolves.toEqual(identities[0]);
    const saved = f.persisted();
    await expect(f.open("https://other.example").initialize()).rejects.toThrow("bound to");
    expect(f.persisted()).toBe(saved);
  });

  it("never replaces invalid state or generates an identity after a storage error", async () => {
    const f = createStateFixture();
    const identity = await f.open().initialize();
    const saved = f.persisted();
    f.effects.failure = new Error("Storage unavailable");
    await expect(f.open().initialize()).rejects.toThrow("Storage unavailable");
    expect(f.persisted()).toBe(saved);
    f.effects.failure = undefined;
    for (const value of [
      null,
      {
        version: 2,
        relayOrigin: "https://mcp.openclaw.ai",
        privateKey: identity.privateKey,
        codes: [],
        grants: [{ ...GRANT, principal: { profileId: "person-one" } }],
      },
    ]) {
      f.seed(value);
      const invalid = f.persisted();
      await expect(f.open().initialize()).rejects.toThrow("Restore a valid OpenClaw state backup");
      expect(f.persisted()).toBe(invalid);
    }
  });

  it("persists person authority and never reuses an existing or revoked grant ID", async () => {
    const f = createStateFixture();
    const state = await paired(f);
    const grant = { ...GRANT, grantId: "gr_person", ...PERSON_AUTHORITY };
    const assertCurrent = () => {};
    await expect(state.approveGrant(grant, assertCurrent)).resolves.toBe(true);
    const restarted = f.open();
    await restarted.initialize();
    expect(restarted.getGrant(grant.grantId)).toEqual(grant);
    await expect(restarted.authorize(grant.grantId, 20)).resolves.toMatchObject(PERSON_AUTHORITY);
    await expect(state.approveGrant({ ...grant, ...OWNER_AUTHORITY }, assertCurrent)).resolves.toBe(
      false,
    );
    await state.recordRevocation(grant.grantId, 30);
    expect(state.getGrant(grant.grantId)).toBeUndefined();
    await expect(state.approveGrant(grant, assertCurrent)).resolves.toBe(false);
    await state.recordRevocation("gr_unknown", 30);
    await expect(
      state.approveGrant({ ...grant, grantId: "gr_unknown" }, assertCurrent),
    ).resolves.toBe(false);
  });

  it("atomically consumes a code once across concurrent requests and restart", async () => {
    const f = createStateFixture();
    const state = f.open();
    await state.initialize();
    await state.issue(PAIR.codeHash, 1_000, 0, undefined, PERSON_AUTHORITY);
    const results = await Promise.all(
      ["gr_a", "gr_b"].map((grantId) => f.open().createGrant({ ...PAIR, grantId }, 10)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    const grants = await f.open().grants();
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({ ...PERSON_AUTHORITY, clientId: CLIENT.id, createdAt: 10 });
    for (const codeHash of [PAIR.codeHash, "unknown"]) {
      await expect(state.createGrant({ ...PAIR, codeHash }, 11)).resolves.toBe(false);
    }
    await state.issue("expired", 20, 0);
    await expect(state.createGrant({ ...PAIR, codeHash: "expired" }, 20)).resolves.toBe(false);
  });

  it("retains revocation and last-use facts through restart without resurrecting grant IDs", async () => {
    const f = createStateFixture();
    const state = await paired(f);
    expect(() => state.assertGrantCurrent(GRANT.grantId)).not.toThrow();
    expect(() => state.assertGrantCurrent("unknown")).toThrow("revoked");
    await expect(state.authorize("unknown", 20)).resolves.toBeUndefined();
    await expect(state.authorize(GRANT.grantId, 20)).resolves.toMatchObject(OWNER_AUTHORITY);
    await expect(state.revoke(GRANT.grantId, 30)).resolves.toBe(true);
    expect(() => state.assertGrantCurrent(GRANT.grantId)).toThrow("revoked");
    const restarted = f.open();
    await restarted.initialize();
    await expect(restarted.authorize(GRANT.grantId, 40)).resolves.toBeUndefined();
    await state.issue("fresh", 1_000, 40);
    await expect(state.createGrant({ ...PAIR, codeHash: "fresh" }, 40)).resolves.toBe(false);
    await expect(
      state.createGrant({ ...PAIR, grantId: "gr_two", codeHash: "fresh" }, 40),
    ).resolves.toBe(true);
    await restarted.initialize();
    expect(() => restarted.assertGrantCurrent("gr_two")).not.toThrow();
    expect((await restarted.grants())[0]).toEqual({ ...GRANT, lastUsedAt: 20, revokedAt: 30 });
  });

  it("does not overwrite a concurrent revocation with an authorization prepared earlier", async () => {
    const f = createStateFixture();
    const state = await paired(f);
    f.effects.beforeCompare = async () => {
      await f.open().revoke(GRANT.grantId, 20);
    };
    await expect(state.authorize(GRANT.grantId, 30)).resolves.toBeUndefined();
    await expect(f.open().grants()).resolves.toEqual([{ ...GRANT, revokedAt: 20 }]);
  });

  it.each(["before creation", "while creation is pending"])(
    "preserves a remote revocation received %s through restart",
    async (ordering) => {
      const f = createStateFixture();
      const state = f.open();
      await state.initialize();
      await state.issue(PAIR.codeHash, 1_000, 0);
      await expect(state.revoke(GRANT.grantId, 10)).resolves.toBe(false);
      if (ordering === "before creation") {
        await state.recordRevocation(GRANT.grantId, 20);
      } else {
        f.effects.beforeCompare = async () => {
          await f.open().recordRevocation(GRANT.grantId, 20);
        };
      }
      await expect(state.createGrant(PAIR, 10)).resolves.toBe(false);
      const reopened = f.open();
      await reopened.initialize();
      await expect(reopened.authorize(GRANT.grantId, 30)).resolves.toBeUndefined();
      await reopened.recordRevocation(GRANT.grantId, 40);
      await expect(reopened.grants()).resolves.toEqual([{ grantId: GRANT.grantId, revokedAt: 20 }]);
      await expect(reopened.createGrant(PAIR, 50)).resolves.toBe(false);
    },
  );

  it("rejects oversized admission without consuming the code and reserves revocation capacity", async () => {
    const f = createStateFixture();
    const state = f.open();
    await state.initialize();
    await state.issue(PAIR.codeHash, 1_000, 0);
    const bigGrant = (size: number) => ({ ...PAIR, client: { ...CLIENT, name: "x".repeat(size) } });
    await expect(state.createGrant(bigGrant(512 * 1024), 10)).rejects.toThrow("capacity");
    await expect(state.createGrant(bigGrant(511 * 1024), 10)).resolves.toBe(true);
    await expect(state.authorize(GRANT.grantId, 20)).resolves.toMatchObject(OWNER_AUTHORITY);
    await expect(state.recordRevocation(`gr_${"x".repeat(1_024)}`, 25)).rejects.toThrow("capacity");
    await state.recordRevocation(GRANT.grantId, 30);
    await expect(f.open().authorize(GRANT.grantId, 40)).resolves.toBeUndefined();
    expect((await f.open().grants())[0]).toMatchObject({ lastUsedAt: 20, revokedAt: 30 });
  });

  it("never retries uncertain committed writes and leaves their durable code consumed", async () => {
    const f = createStateFixture();
    const state = f.open();
    await state.initialize();
    await state.issue(PAIR.codeHash, 1_000, 0);
    f.effects.afterCommit = () => {
      throw new Error("Reply lost after commit");
    };
    await expect(state.createGrant(PAIR, 10)).rejects.toThrow("Reply lost");
    await expect(f.open().grants()).resolves.toHaveLength(1);
    await expect(state.createGrant({ ...PAIR, grantId: "gr_two" }, 20)).resolves.toBe(false);
  });

  it("refuses a pairing code that expires while grant persistence is pending", async () => {
    const f = createStateFixture();
    const state = f.open();
    await state.initialize();
    await state.issue(PAIR.codeHash, 1_000, 0);
    const saved = f.persisted();
    f.effects.beforeCompare = async () => {
      f.setNow(1_000);
    };
    await expect(state.createGrant(PAIR, 10)).rejects.toMatchObject({ code: "not_found" });
    expect(f.persisted()).toBe(saved);
  });

  it.each(["issue", "revoke", "approve", "service"] as const)(
    "carries %s authority into pending persistence",
    async (operation) => {
      const f = createStateFixture();
      const state = await paired(f);
      const saved = f.persisted();
      let commandCurrent = true;
      const assertCommandCurrent = () => {
        if (!commandCurrent) {
          throw new Error("Command authority revoked");
        }
      };
      f.effects.beforeCompare = async () => {
        if (operation === "service") {
          f.stop();
        } else {
          commandCurrent = false;
        }
      };
      const pending =
        operation === "issue"
          ? state.issue("fresh", 1_000, 30, assertCommandCurrent)
          : operation === "approve"
            ? state.approveGrant(
                { ...GRANT, grantId: "gr_person", ...PERSON_AUTHORITY },
                assertCommandCurrent,
              )
            : state.revoke(GRANT.grantId, 30, assertCommandCurrent);
      await expect(pending).rejects.toThrow(
        operation === "service" ? "Service stopped" : "Command authority revoked",
      );
      expect(f.persisted()).toBe(saved);
    },
  );
});
