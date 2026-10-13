import { defineSingleProviderPluginEntry } from "openclaw/plugin-sdk/provider-entry";
import { buildProviderReplayFamilyHooks } from "openclaw/plugin-sdk/provider-model-shared";
import { buildProviderToolCompatFamilyHooks } from "openclaw/plugin-sdk/provider-tools";
import manifest from "./openclaw.plugin.json" with { type: "json" };

const PROVIDER_ID = "netmind";

export default defineSingleProviderPluginEntry({
  id: PROVIDER_ID,
  name: "NetMind Provider",
  description: "Official OpenClaw NetMind provider plugin",
  manifest,
  provider: {
    label: "NetMind",
    docsPath: "/providers/netmind",
    catalog: {},
    ...buildProviderReplayFamilyHooks({
      family: "openai-compatible",
      dropReasoningFromHistory: false,
    }),
    ...buildProviderToolCompatFamilyHooks("openai"),
  },
});
