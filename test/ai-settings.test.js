import test from "node:test";
import assert from "node:assert/strict";
import { aiSettingsEnvironment, normalizeAiSettings, publicAiSettings } from "../lib/ai-settings.js";
import { getDeepSeekConfig } from "../lib/custom-liquid.js";

test("manual AI settings accept custom model IDs and preserve a stored key", () => {
  const settings = normalizeAiSettings({
    baseUrl: "https://gateway.example.com/v1/",
    model: "provider/fast-model-v2",
    apiKey: "",
    thinking: "disabled",
    maxTokens: 32768,
    timeoutMs: 90000
  }, { apiKey: "stored-secret" });
  assert.equal(settings.apiKey, "stored-secret");
  assert.equal(settings.baseUrl, "https://gateway.example.com/v1");
  assert.equal(settings.model, "provider/fast-model-v2");
  assert.equal(settings.timeoutMs, 90000);
});

test("manual AI settings reject plaintext remote API endpoints", () => {
  assert.throws(
    () => normalizeAiSettings({ baseUrl: "http://gateway.example.com/v1", model: "fast-model" }),
    /HTTPS/
  );
  assert.equal(normalizeAiSettings({ baseUrl: "http://localhost:11434/v1", model: "local-model" }).baseUrl, "http://localhost:11434/v1");
});

test("public AI settings never expose the complete API key", () => {
  const config = getDeepSeekConfig(aiSettingsEnvironment(normalizeAiSettings({
    apiKey: "sk-private-12345678",
    baseUrl: "https://api.example.com/v1",
    model: "fast-model"
  }), {}));
  const output = publicAiSettings(config, "manual");
  assert.equal(output.hasApiKey, true);
  assert.equal(output.apiKeyHint, "••••5678");
  assert.equal("apiKey" in output, false);
  assert.equal(output.model, "fast-model");
});
