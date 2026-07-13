const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_MAX_TOKENS = 64_000;
const DEFAULT_TIMEOUT_MS = 240_000;

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.round(number)));
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(String(value || DEFAULT_BASE_URL).trim());
  } catch {
    throw new Error("API 地址格式不正确");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("API 地址不能包含账号、密码、查询参数或锚点");
  }
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("API 地址必须使用 HTTPS，本机模型服务可使用 localhost HTTP");
  }
  return url.href.replace(/\/+$/, "");
}

function normalizeModel(value) {
  const model = String(value || DEFAULT_MODEL).trim();
  if (!/^[a-zA-Z0-9._:/-]{1,160}$/.test(model)) {
    throw new Error("模型 ID 只能包含字母、数字、点、横线、下划线、斜线或冒号");
  }
  return model;
}

export function normalizeAiSettings(input = {}, current = {}) {
  const submittedKey = String(input.apiKey || "").trim();
  const apiKey = submittedKey || String(current.apiKey || "").trim();
  if (apiKey.length > 500) throw new Error("API Key 长度不正确");
  return {
    apiKey,
    baseUrl: normalizeBaseUrl(input.baseUrl || current.baseUrl || DEFAULT_BASE_URL),
    model: normalizeModel(input.model || current.model || DEFAULT_MODEL),
    thinking: String(input.thinking || current.thinking || "disabled") === "enabled" ? "enabled" : "disabled",
    maxTokens: boundedInteger(input.maxTokens, current.maxTokens || DEFAULT_MAX_TOKENS, 4096, 192_000),
    timeoutMs: boundedInteger(input.timeoutMs, current.timeoutMs || DEFAULT_TIMEOUT_MS, 30_000, 600_000)
  };
}

export function aiSettingsEnvironment(settings, baseEnvironment = process.env) {
  return {
    ...baseEnvironment,
    DEEPSEEK_API_KEY: settings.apiKey,
    DEEPSEEK_BASE_URL: settings.baseUrl,
    DEEPSEEK_MODEL: settings.model,
    DEEPSEEK_THINKING: settings.thinking,
    DEEPSEEK_MAX_TOKENS: String(settings.maxTokens),
    DEEPSEEK_TIMEOUT_MS: String(settings.timeoutMs),
    DEEPSEEK_MOCK: "0"
  };
}

export function publicAiSettings(config, source = "environment") {
  const key = String(config.apiKey || "");
  return {
    configured: config.configured,
    source,
    baseUrl: config.baseUrl,
    model: config.mock ? "mock" : config.model,
    thinking: config.thinking,
    maxTokens: config.maxTokens,
    timeoutMs: config.timeoutMs,
    mock: config.mock,
    hasApiKey: Boolean(key),
    apiKeyHint: key ? `••••${key.slice(-4)}` : ""
  };
}
