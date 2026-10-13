import { streamSimple, type Context, type Model } from "openclaw/plugin-sdk/llm";
import { buildManifestModelProviderConfig } from "openclaw/plugin-sdk/provider-catalog-shared";
import { isLiveTestEnabled } from "openclaw/plugin-sdk/test-live";
import { describe, expect, it } from "vitest";
import manifest from "./openclaw.plugin.json" with { type: "json" };

const NETMIND_KEY = process.env.NETMIND_API_KEY ?? "";
const LIVE = isLiveTestEnabled(["NETMIND_LIVE_TEST"]);
const describeLive = LIVE && NETMIND_KEY ? describe : describe.skip;

function resolveLiveModel(): Model<"openai-completions"> {
  const provider = buildManifestModelProviderConfig({
    providerId: "netmind",
    catalog: manifest.modelCatalog.providers.netmind,
  });
  const model = provider.models?.[0];
  if (!model) {
    throw new Error("NetMind bundled catalog did not provide its default model");
  }
  return {
    ...model,
    provider: "netmind",
    api: "openai-completions",
    baseUrl: provider.baseUrl,
  } as Model<"openai-completions">;
}

describeLive("netmind plugin live", () => {
  it("streams assistant text from the bundled model", async () => {
    const stream = streamSimple(
      resolveLiveModel(),
      {
        messages: [{ role: "user", content: "Reply with exactly: ok", timestamp: Date.now() }],
      },
      { apiKey: NETMIND_KEY, maxTokens: 32 },
    );
    const result = await stream.result();

    if (result.stopReason === "error") {
      throw new Error(result.errorMessage || "NetMind returned an error with no message");
    }
    const text = result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text.trim())
      .filter(Boolean)
      .join(" ");
    expect(text.length).toBeGreaterThan(0);
  }, 60_000);

  it("returns a tool call", async () => {
    const context = {
      messages: [
        {
          role: "user",
          content: "Call ping with the value ok. Do not answer in plain text.",
          timestamp: Date.now(),
        },
      ],
      tools: [
        {
          name: "ping",
          description: "Return a value.",
          parameters: {
            type: "object",
            properties: { value: { type: "string" } },
            required: ["value"],
            additionalProperties: false,
          },
        },
      ],
    } as Context;
    const stream = streamSimple(resolveLiveModel(), context, {
      apiKey: NETMIND_KEY,
      maxTokens: 128,
    });
    const result = await stream.result();

    if (result.stopReason === "error") {
      throw new Error(result.errorMessage || "NetMind returned an error with no message");
    }
    expect(result.stopReason).toBe("toolUse");
    expect(result.content).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: "toolCall", name: "ping" })]),
    );
  }, 60_000);
});
