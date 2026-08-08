export type GroqProvider = {
  name: "Groq";
  label: string;
  apiKey: string;
  baseUrl: string;
  model: string;
  headers?: Record<string, string>;
};

let providerRotationSignature = "";
let nextProviderIndex = 0;

export function getConfiguredGroqProviders(): GroqProvider[] {
  const apiKeys = [
    process.env.GROQ_API_KEY,
    process.env.GROQ_API_KEY_2,
    process.env.GROQ_API_KEY_3,
    process.env.GROQ_API_KEY_4,
    process.env.GROQ_API_KEY_5
  ].filter((key, index, keys): key is string => Boolean(key) && keys.indexOf(key) === index);

  return apiKeys.map((apiKey, index) => ({
    name: "Groq",
    label: apiKeys.length > 1 ? `Groq key ${index + 1}` : "Groq",
    apiKey,
    baseUrl: "https://api.groq.com/openai/v1/chat/completions",
    model: process.env.GROQ_MODEL || "openai/gpt-oss-120b"
  }));
}

export function getRotatedGroqProviders() {
  const providers = getConfiguredGroqProviders();
  if (providers.length === 0) return providers;

  const signature = providers.map((provider) => provider.apiKey).join("\u0000");
  if (signature !== providerRotationSignature) {
    providerRotationSignature = signature;
    nextProviderIndex = 0;
  }

  const startIndex = nextProviderIndex % providers.length;
  nextProviderIndex = (startIndex + 1) % providers.length;
  return [...providers.slice(startIndex), ...providers.slice(0, startIndex)];
}

export function hasConfiguredGroqProvider() {
  return getConfiguredGroqProviders().length > 0;
}
