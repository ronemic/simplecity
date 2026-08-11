import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  getLlmProvidersForInput,
  GROQ_MAX_ESTIMATED_INPUT_TOKENS,
  providerSpecificRequestFields
} from "@/lib/llm/provider";

const ENV_NAMES = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_MODEL",
  "GROQ_API_KEY",
  "GROQ_API_KEY_2",
  "GROQ_API_KEY_3",
  "GROQ_API_KEY_4",
  "GROQ_API_KEY_5",
  "GROQ_MODEL"
] as const;

function configureHybridProviders() {
  process.env.OPENROUTER_API_KEY = "openrouter-routing-test";
  process.env.OPENROUTER_MODEL = "openai/gpt-oss-120b";
  process.env.GROQ_API_KEY = "groq-routing-test-1";
  process.env.GROQ_API_KEY_2 = "groq-routing-test-2";
  process.env.GROQ_API_KEY_3 = "groq-routing-test-3";
  process.env.GROQ_API_KEY_4 = "groq-routing-test-4";
  process.env.GROQ_API_KEY_5 = "groq-routing-test-5";
  process.env.GROQ_MODEL = "openai/gpt-oss-120b";
}

function preserveProviderEnv(t: TestContext) {
  const original = new Map(ENV_NAMES.map((name) => [name, process.env[name]]));
  t.after(() => {
    for (const name of ENV_NAMES) {
      const value = original.get(name);
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });
}

test("rotates short requests across all five Groq keys with bounded failover", (t) => {
  preserveProviderEnv(t);
  configureHybridProviders();

  const primaryLabels = Array.from({ length: 5 }, () =>
    getLlmProvidersForInput("short civic prompt").map((provider) => provider.label)
  );

  assert.deepEqual(primaryLabels.map((labels) => labels[0]), [
    "Groq key 1",
    "Groq key 2",
    "Groq key 3",
    "Groq key 4",
    "Groq key 5"
  ]);
  for (const labels of primaryLabels) {
    assert.equal(labels.length, 3);
    assert.match(labels[1], /^Groq key /);
    assert.equal(labels[2], "OpenRouter");
  }
});

test("keeps requests above the Groq threshold on regular OpenRouter", (t) => {
  preserveProviderEnv(t);
  configureHybridProviders();

  const largeInput = "x".repeat(GROQ_MAX_ESTIMATED_INPUT_TOKENS * 4 + 1);
  const providers = getLlmProvidersForInput(largeInput);

  assert.deepEqual(providers.map((provider) => provider.label), ["OpenRouter"]);
  assert.equal(providers[0].model, "openai/gpt-oss-120b");
});

test("uses provider routing fields only for OpenRouter", (t) => {
  preserveProviderEnv(t);
  configureHybridProviders();

  const providers = getLlmProvidersForInput("short civic prompt");
  assert.deepEqual(providerSpecificRequestFields(providers[0]), {});
  assert.deepEqual(providerSpecificRequestFields(providers.at(-1)!), {
    provider: { require_parameters: true }
  });
});
