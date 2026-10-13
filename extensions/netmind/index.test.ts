import type { Context, Model } from "openclaw/plugin-sdk/llm";
import { registerSingleProviderPlugin } from "openclaw/plugin-sdk/plugin-test-runtime";
import { buildOpenAICompletionsParams } from "openclaw/plugin-sdk/provider-transport-runtime";
import { describe, expect, it } from "vitest";
import plugin from "./index.js";

describe("netmind provider plugin", () => {
  it("registers NetMind with its bundled model catalog", async () => {
    const provider = await registerSingleProviderPlugin(plugin);

    expect(provider.id).toBe("netmind");
    expect(provider.envVars).toEqual(["NETMIND_API_KEY"]);
    expect(provider.auth?.map((method) => method.id)).toEqual(["api-key"]);
    expect(provider.auth?.[0]?.starterModel).toBe("netmind/Qwen/Qwen3.8-Flash");

    const result = await provider.staticCatalog?.run({
      config: {},
      env: {},
      resolveProviderApiKey: () => ({}),
    } as never);
    const catalogProvider = result && "provider" in result ? result.provider : undefined;
    expect(catalogProvider?.baseUrl).toBe("https://api.netmind.ai/inference-api/v1");
    expect(catalogProvider?.models).toHaveLength(31);
    expect(catalogProvider?.models).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "openai/gpt-6-astra",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 1000000,
          maxTokens: 128000,
          cost: { input: 10, output: 50, cacheRead: 1, cacheWrite: 12.5 },
          compat: expect.objectContaining({
            supportsStore: false,
            supportsDeveloperRole: false,
            supportsReasoningEffort: false,
            supportsStrictMode: false,
            maxTokensField: "max_tokens",
          }),
        }),
        expect.objectContaining({
          id: "anthropic/claude-opus-5-5",
          reasoning: true,
          input: ["text", "image"],
          contextWindow: 1000000,
          maxTokens: 128000,
          cost: { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
        }),
      ]),
    );
  });

  it("uses NetMind-compatible OpenAI completion fields", async () => {
    const provider = await registerSingleProviderPlugin(plugin);
    const result = await provider.staticCatalog?.run({
      config: {},
      env: {},
      resolveProviderApiKey: () => ({}),
    } as never);
    const catalogProvider = result && "provider" in result ? result.provider : undefined;
    const catalogModel = catalogProvider?.models?.[0];
    if (!catalogProvider || !catalogModel) {
      throw new Error("NetMind bundled catalog did not provide its default model");
    }

    const model = {
      ...catalogModel,
      provider: "netmind",
      api: "openai-completions",
      baseUrl: catalogProvider.baseUrl,
    } as Model<"openai-completions">;
    const context = {
      systemPrompt: "system",
      messages: [{ role: "user", content: "hello", timestamp: 1 }],
      tools: [
        {
          name: "lookup",
          description: "Look up a value",
          parameters: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
    } as Context;
    const payload = buildOpenAICompletionsParams(model, context, { maxTokens: 128 } as never);

    expect(payload.max_tokens).toBe(128);
    expect(payload).not.toHaveProperty("max_completion_tokens");
    expect(payload).not.toHaveProperty("store");
    expect(payload.messages).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: "system", content: "system" })]),
    );
    expect(payload.tools).toHaveLength(1);
  });
});
