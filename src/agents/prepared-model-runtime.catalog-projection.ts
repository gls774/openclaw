import { prepareModelCatalogThinkingPolicies } from "../plugins/provider-thinking.js";
import { dedupeByKey } from "../shared/dedupe-by-key.js";
import type { ModelCatalogSnapshot } from "./model-catalog.types.js";
import { createModelCatalogIdentityKeyResolver } from "./openai-model-routes.js";
import type {
  PreparedModelRuntimeAgentFacts,
  PreparedModelRuntimeCatalogFacts,
} from "./prepared-model-runtime.catalog-contract.js";
import { prepareConfiguredRuntimeFacts } from "./prepared-model-runtime.configured-catalog.js";
import { materializePreparedModelCatalog } from "./prepared-model-runtime.full-catalog.js";
import type {
  PreparedModelCatalogInventory,
  PreparedModelRuntimePluginGeneration,
} from "./prepared-model-runtime.types.js";

/** Composes retained discovery with current configured metadata and runtime capabilities. */
export function createPreparedModelCatalogProjection(params: {
  agentFacts: PreparedModelRuntimeAgentFacts;
  normalizeProvider: (provider: string) => string;
  catalogFacts: PreparedModelRuntimeCatalogFacts;
  pluginGeneration: PreparedModelRuntimePluginGeneration;
}) {
  return (
    catalog: ModelCatalogSnapshot,
    configuredRuntimeModels: PreparedModelRuntimeCatalogFacts["configuredRuntimeModels"],
    acquiredProviders?: PreparedModelCatalogInventory["providers"],
  ) => {
    let sourceCatalog = catalog;
    if (acquiredProviders) {
      // Retained siblings cannot hide a provider's current captured rows before acquisition.
      // Completed providers, including successful empty results, own their inventory instead.
      const unacquired = (entries: ModelCatalogSnapshot["entries"]) =>
        entries.filter(
          (entry) =>
            !entry.nativeRuntime &&
            !acquiredProviders.has(params.normalizeProvider(entry.provider)),
        );
      sourceCatalog = {
        ...catalog,
        entries: [...catalog.entries, ...unacquired(params.catalogFacts.modelCatalog.entries)],
        routeVariants: [
          ...catalog.routeVariants,
          ...unacquired(params.catalogFacts.modelCatalog.routeVariants),
        ],
      };
    }
    const configured = prepareConfiguredRuntimeFacts({
      agentFacts: params.agentFacts,
      workspaceFacts: params.pluginGeneration,
      templateModelRegistry: params.catalogFacts.templateModelRegistry,
      configuredRuntimeModels,
    }).modelCatalog;
    const current = materializePreparedModelCatalog(
      configured,
      params.agentFacts.runtimeCapabilityModels,
    );
    const projected = materializePreparedModelCatalog(
      sourceCatalog,
      params.agentFacts.runtimeCapabilityModels,
      current.staticEntries,
    );
    // Native discovery cannot replace the authentication facts of an API provider.
    const apiProviders = new Set(
      projected.providerOutcomes?.map(({ provider }) => params.normalizeProvider(provider)),
    );
    const nativeOutcomes = Object.values(catalog.nativeProviderOutcomes ?? {})
      .flat()
      .filter(({ provider }) => !apiProviders.has(params.normalizeProvider(provider)));
    if (nativeOutcomes.length) {
      projected.providerOutcomes = [...(projected.providerOutcomes ?? []), ...nativeOutcomes];
    }
    const keyOf = createModelCatalogIdentityKeyResolver();
    projected.entries = dedupeByKey([...projected.entries, ...current.entries], keyOf);
    projected.routeVariants = dedupeByKey(
      [...projected.routeVariants, ...current.routeVariants],
      (entry) => JSON.stringify([keyOf(entry), entry.api, entry.baseUrl, entry.nativeRuntime]),
    );
    prepareModelCatalogThinkingPolicies({
      catalog: projected,
      metadataSnapshot: params.pluginGeneration.pluginMetadataSnapshot,
      pluginRegistry: params.pluginGeneration.pluginRegistry,
    });
    return projected;
  };
}
