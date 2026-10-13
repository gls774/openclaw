---
summary: "NetMind setup (API key + model selection)"
title: "NetMind"
read_when:
  - You want to use NetMind models with OpenClaw
  - You need the NetMind API key environment variable or CLI auth choice
---

[NetMind](https://www.netmind.ai/) provides hosted models through an
OpenAI-compatible inference API. OpenClaw bundles it as the `netmind` provider.

| Property | Value                                            |
| -------- | ------------------------------------------------ |
| Provider | `netmind`                                        |
| Auth     | `NETMIND_API_KEY`                                |
| API      | OpenAI-compatible                                |
| Base URL | `https://api.netmind.ai/inference-api/v1`        |

## Getting started

<Steps>
  <Step title="Get an API key">
    Create an account and API key from the [NetMind dashboard](https://www.netmind.ai/).
  </Step>
  <Step title="Run onboarding">
    ```bash
    openclaw onboard --auth-choice netmind-api-key
    ```
  </Step>
  <Step title="Set a default model">
    ```json5
    {
      agents: {
        defaults: {
          model: {
            primary: "netmind/Qwen/Qwen3.8-Flash",
          },
        },
      },
    }
    ```
  </Step>
</Steps>

### Non-interactive example

```bash
openclaw onboard --non-interactive --accept-risk --skip-health \
  --mode local \
  --auth-choice netmind-api-key \
  --netmind-api-key "$NETMIND_API_KEY"
```

## Built-in catalog

Cost is USD per million tokens.

| Model ref                                     | Input | Context | Max output | Cost (in/out) | Notes               |
| --------------------------------------------- | ----- | ------- | ---------- | ------------- | ------------------- |
| `netmind/Qwen/Qwen3.8-Flash` | text, image | 1,000,000 | 131,072 | 0.15 / 0.47 | Default model |

<AccordionGroup>
  <Accordion title="Environment note">
    If the Gateway runs as a daemon, make sure `NETMIND_API_KEY` is available
    to that process, for example in `~/.openclaw/.env` or through `env.shellEnv`.

    Keys exported only in an interactive shell are not visible to a
    daemon-managed Gateway.

  </Accordion>

  <Accordion title="Troubleshooting">
    - Verify the configured catalog: `openclaw models list --provider netmind`
    - Confirm the API key is visible to the Gateway process.
    - Model refs use the form `netmind/<model-id>`.
  </Accordion>
</AccordionGroup>

## Related

<CardGroup cols={2}>
  <Card title="Model providers" href="/concepts/model-providers" icon="layers">
    Provider rules, model refs, and failover behavior.
  </Card>
  <Card title="Configuration reference" href="/gateway/configuration-reference" icon="gear">
    Full config schema including provider settings.
  </Card>
  <Card title="NetMind model library" href="https://www.netmind.ai/modelsLibrary" icon="arrow-up-right-from-square">
    Browse models available through NetMind API.
  </Card>
</CardGroup>
