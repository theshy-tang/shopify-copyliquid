const form = document.querySelector("#extract-form");
const urlInput = document.querySelector("#url");
const submitButton = document.querySelector("#submit-button");
const statusPanel = document.querySelector("#status-panel");
const results = document.querySelector("#results");
const moduleList = document.querySelector("#module-list");
const filterInput = document.querySelector("#filter");
const toast = document.querySelector("#toast");
const aiStatusLabel = document.querySelector("#ai-status");
const aiHelp = document.querySelector("#ai-help");
const selectionCount = document.querySelector("#selection-count");
const generateSelectedButton = document.querySelector("#generate-selected");
const copySelectedLiquidButton = document.querySelector("#copy-selected-liquid");
const combinedLiquidMeta = document.querySelector("#combined-liquid-meta");
const cancelGenerationButton = document.querySelector("#cancel-generation");
const replacementList = document.querySelector("#replacement-list");
const addReplacementButton = document.querySelector("#add-replacement");
const batchProgress = document.querySelector("#batch-progress");
const batchProgressTitle = document.querySelector("#batch-progress-title");
const batchProgressDetail = document.querySelector("#batch-progress-detail");
const batchProgressBar = document.querySelector("#batch-progress-bar");
const batchProgressTrack = document.querySelector("#batch-progress-track");
const liquidGroups = document.querySelector("#liquid-groups");
const liquidGroupSizeSelect = document.querySelector("#liquid-group-size");
const liquidGroupList = document.querySelector("#liquid-group-list");
const modelSettingsDialog = document.querySelector("#model-settings-dialog");
const modelSettingsForm = document.querySelector("#model-settings-form");
const modelSettingsSource = document.querySelector("#model-settings-source");
const modelSettingsStatus = document.querySelector("#model-settings-status");
const openModelSettingsButton = document.querySelector("#open-model-settings");
const closeModelSettingsButton = document.querySelector("#close-model-settings");
const testModelSettingsButton = document.querySelector("#test-model-settings");
const saveModelSettingsButton = document.querySelector("#save-model-settings");
const restoreEnvSettingsButton = document.querySelector("#restore-env-settings");
const apiBaseUrlInput = document.querySelector("#ai-base-url");
const apiBaseUrlHelp = document.querySelector("#ai-base-url-help");
const apiKeyInput = document.querySelector("#ai-api-key");
const apiKeyHelp = document.querySelector("#api-key-help");
const toggleApiKeyButton = document.querySelector("#toggle-api-key");
const aiProviderInput = document.querySelector("#ai-provider");
const aiModelInput = document.querySelector("#ai-model");
const modelSuggestions = document.querySelector("#model-suggestions");
const modelResultsField = document.querySelector("#ai-model-results-field");
const modelResultsSelect = document.querySelector("#ai-model-results");
const aiThinkingInput = document.querySelector("#ai-thinking");
const aiTimeoutInput = document.querySelector("#ai-timeout");
const aiMaxTokensInput = document.querySelector("#ai-max-tokens");
const imageReplacementDialog = document.querySelector("#image-replacement-dialog");
const imageReplacementTitle = document.querySelector("#image-replacement-title");
const imageReplacementCount = document.querySelector("#image-replacement-count");
const imageReplacementSubtitle = document.querySelector("#image-replacement-subtitle");
const imageReplacementList = document.querySelector("#image-replacement-list");
const imageReplacementEmpty = document.querySelector("#image-replacement-empty");
const closeImageReplacementButton = document.querySelector("#close-image-replacement");
const clearImageReplacementsButton = document.querySelector("#clear-image-replacements");
const applyImageReplacementsButton = document.querySelector("#apply-image-replacements");

let extraction = null;
let aiConfig = { configured: false, provider: "deepseek", model: "deepseek-v4-flash", checking: true, mock: false };
let loadedModelSettings = null;
let previewLoadObserver = null;
let replacementRows = [];
let batchController = null;
let batchActive = false;
let liquidGroupSize = 5;
let liquidGroupState = { signature: "", groups: [] };
const includedModules = new Set();
const liquidResults = new Map();
const reviewLimits = new Map();
const imageReplacements = new Map();
const replacementCorpusCache = new Map();
const previewStates = new WeakMap();
const liquidPreviewBridges = new Map();
const moduleCssCache = new Map();
let activeImageModuleIndex = null;
let activeImageItems = [];
const SHOPIFY_CUSTOM_LIQUID_SAFE_BYTES = 49_000;

const escapeHtml = (value = "") => String(value).replace(/[&<>'"]/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
})[char]);

const uniqueId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function setModelSettingsStatus(message, state = "") {
  modelSettingsStatus.textContent = message;
  if (state) modelSettingsStatus.dataset.state = state;
  else delete modelSettingsStatus.dataset.state;
}

function setModelSettingsBusy(busy) {
  testModelSettingsButton.disabled = busy;
  saveModelSettingsButton.disabled = busy;
  restoreEnvSettingsButton.disabled = busy;
}

function modelSettingsPayload() {
  return {
    provider: aiProviderInput.value,
    baseUrl: apiBaseUrlInput.value.trim(),
    apiKey: apiKeyInput.value.trim(),
    model: aiModelInput.value.trim(),
    thinking: aiThinkingInput.value,
    timeoutMs: Number(aiTimeoutInput.value) * 1000,
    maxTokens: Number(aiMaxTokensInput.value)
  };
}

function providerName(provider) {
  if (provider === "newapi") return "New API";
  if (provider === "deepseek") return "DeepSeek";
  return "OpenAI 兼容接口";
}

function renderModelSuggestions(values = []) {
  const fetchedModels = [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
  const defaults = aiProviderInput.value === "deepseek"
    ? ["deepseek-chat", "deepseek-reasoner", "deepseek-v4-flash", "deepseek-v4-pro"]
    : [];
  const models = [...new Set([...fetchedModels, ...defaults])];
  modelSuggestions.innerHTML = models.map((model) => `<option value="${escapeHtml(model)}"></option>`).join("");
  modelResultsField.hidden = fetchedModels.length === 0;
  modelResultsSelect.innerHTML = `<option value="">选择一个模型（共 ${fetchedModels.length} 个）</option>${fetchedModels.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("")}`;
  modelResultsSelect.value = fetchedModels.includes(aiModelInput.value.trim()) ? aiModelInput.value.trim() : "";
}

function updateProviderFields(provider = aiProviderInput.value) {
  if (provider === "newapi") {
    apiBaseUrlInput.placeholder = "https://你的-newapi-域名/v1";
    apiBaseUrlHelp.innerHTML = "填写 New API 平台地址；保存时会自动补全 <code>/v1</code>，不要包含具体接口路径。";
    aiModelInput.placeholder = "测试连接后选择模型，或直接输入模型 ID";
  } else if (provider === "deepseek") {
    apiBaseUrlInput.placeholder = "https://api.deepseek.com";
    apiBaseUrlHelp.innerHTML = "填写 DeepSeek 服务根地址，不要包含 <code>/chat/completions</code>。";
    aiModelInput.placeholder = "deepseek-chat";
  } else {
    apiBaseUrlInput.placeholder = "https://api.example.com/v1";
    apiBaseUrlHelp.innerHTML = "填写 OpenAI 兼容 Base URL，不要包含 <code>/chat/completions</code>。";
    aiModelInput.placeholder = "输入接口支持的模型 ID";
  }
  renderModelSuggestions();
}

function populateModelSettings(data) {
  aiProviderInput.value = data.provider || "deepseek";
  updateProviderFields(aiProviderInput.value);
  apiBaseUrlInput.value = data.baseUrl || "https://api.deepseek.com";
  aiModelInput.value = data.model === "mock" ? "deepseek-v4-flash" : (data.model || "deepseek-v4-flash");
  aiThinkingInput.value = data.thinking === "enabled" ? "enabled" : "disabled";
  aiTimeoutInput.value = Math.round((Number(data.timeoutMs) || 240000) / 1000);
  aiMaxTokensInput.value = Number(data.maxTokens) || 64000;
  apiKeyInput.value = "";
  apiKeyInput.type = "password";
  toggleApiKeyButton.textContent = "显示";
  toggleApiKeyButton.setAttribute("aria-pressed", "false");
  toggleApiKeyButton.setAttribute("aria-label", "显示 API Key");
  apiKeyInput.placeholder = data.hasApiKey ? `已保存 ${data.apiKeyHint}，输入可替换` : "输入 API Key";
  apiKeyHelp.textContent = data.hasApiKey
    ? `当前密钥 ${data.apiKeyHint}，留空会继续使用，完整密钥不会返回浏览器。`
    : "尚未保存密钥，请输入 API Key。";
  modelSettingsSource.dataset.source = data.source || "environment";
  modelSettingsSource.textContent = data.source === "manual" ? "手动配置" : ".env 配置";
  loadedModelSettings = data;
}

async function loadModelSettings() {
  setModelSettingsStatus("正在读取当前配置", "checking");
  const response = await fetch("/api/ai/config");
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "无法读取模型配置");
  populateModelSettings(data);
  setModelSettingsStatus(data.configured ? `当前模型：${data.model}` : "当前没有可用的 API Key");
  return data;
}

async function openModelSettings() {
  if (!modelSettingsDialog.open) modelSettingsDialog.showModal();
  try {
    await loadModelSettings();
  } catch (error) {
    setModelSettingsStatus(error.message, "error");
  }
}

async function copyText(text, message) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast(message);
}

function downloadText(text, filename, type = "text/plain;charset=utf-8") {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([text], { type }));
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function normalizeImageUrl(value) {
  const url = String(value || "").trim();
  if (!url || url.startsWith("#") || /^(?:data|blob|javascript):/i.test(url)) return "";
  return url;
}

function isLikelyImageUrl(value) {
  const url = normalizeImageUrl(value);
  if (!url) return false;
  if (/\.(?:avif|gif|jpe?g|png|svg|webp|ico)(?:[?#]|$)/i.test(url)) return true;
  if (/(?:cdn\.shopify\.com|\/cdn\/shop\/|\/files\/|\/products\/|image|img|photo|picture|media)/i.test(url)) return true;
  return !/\.(?:css|js|mjs|woff2?|ttf|otf|eot|json)(?:[?#]|$)/i.test(url);
}

function isRelativeDecorationImageUrl(value) {
  const url = normalizeImageUrl(value);
  return /^(?:\.{1,2}\/|[^/:?#]+\/|[^/:?#]+\.(?:gif|svg|png|jpe?g|webp|avif|ico)(?:[?#]|$))/i.test(url) &&
    !/^(?:https?:)?\/\//i.test(url) &&
    !/^(?:\/cdn\/|\/files\/|\/products\/)/i.test(url);
}

function srcsetUrls(value) {
  return String(value || "").split(",")
    .map((part) => normalizeImageUrl(part.trim().split(/\s+/)[0]))
    .filter(Boolean);
}

function srcsetEntries(value) {
  return String(value || "").split(",").map((part) => {
    const bits = part.trim().split(/\s+/);
    const url = normalizeImageUrl(bits[0]);
    const descriptorWidth = Number.parseInt(String(bits[1] || "").replace(/w$/i, ""), 10);
    return { url, descriptorWidth: Number.isFinite(descriptorWidth) ? descriptorWidth : 0 };
  }).filter((entry) => entry.url);
}

function imageVariantInfo(value, descriptorWidth = 0) {
  const original = normalizeImageUrl(value);
  const fallback = { key: original, width: descriptorWidth || 0 };
  try {
    const url = new URL(original, extraction?.url || window.location.href);
    const queryWidth = Number.parseInt(url.searchParams.get("width") || url.searchParams.get("w") || "", 10);
    const pathWidth = Number.parseInt(url.pathname.match(/[_-](\d{2,5})x(?:\d{2,5})?(?=\.[a-z0-9]+$)/i)?.[1] || "", 10);
    const width = [descriptorWidth, queryWidth, pathWidth].filter(Number.isFinite).reduce((max, item) => Math.max(max, item || 0), 0);
    ["width", "w", "height", "h"].forEach((name) => url.searchParams.delete(name));
    url.pathname = url.pathname.replace(/([_-])\d{2,5}x(?:\d{2,5})?(?=\.[a-z0-9]+$)/i, "");
    return { key: url.href, width };
  } catch {
    return fallback;
  }
}

function urlsFromCssText(value) {
  const urls = [];
  String(value || "").replace(/url\((['"]?)(.*?)\1\)/gi, (_match, _quote, url) => {
    const normalized = normalizeImageUrl(url);
    if (normalized && !isRelativeDecorationImageUrl(normalized) && isLikelyImageUrl(normalized)) urls.push(normalized);
    return _match;
  });
  return urls;
}

function pushImageItem(items, seen, url, source, descriptorWidth = 0) {
  const normalized = normalizeImageUrl(url);
  if (!normalized || !isLikelyImageUrl(normalized)) return;
  const variant = imageVariantInfo(normalized, descriptorWidth);
  if (seen.has(variant.key)) {
    const existing = items[seen.get(variant.key)];
    if (!existing.sources.includes(source)) existing.sources.push(source);
    if (!existing.variants.includes(normalized)) existing.variants.push(normalized);
    if ((variant.width || 0) > (existing.width || 0)) {
      existing.url = normalized;
      existing.width = variant.width;
    }
    return;
  }
  seen.set(variant.key, items.length);
  items.push({
    key: `image-${items.length + 1}`,
    url: normalized,
    width: variant.width,
    variants: [normalized],
    sources: [source]
  });
}

function collectImageLinks(module, css = "") {
  const items = [];
  const seen = new Map();
  const template = document.createElement("template");
  template.innerHTML = module.html || "";
  const directAttributes = ["src", "poster", "data-src", "data-bg", "data-background-image"];
  const srcsetAttributes = ["srcset", "data-srcset"];

  template.content.querySelectorAll("*").forEach((node) => {
    const tag = node.tagName.toLowerCase();
    directAttributes.forEach((attribute) => {
      const value = node.getAttribute(attribute);
      if (value) pushImageItem(items, seen, value, `${tag}[${attribute}]`);
    });
    srcsetAttributes.forEach((attribute) => {
      srcsetEntries(node.getAttribute(attribute)).forEach((entry) => pushImageItem(items, seen, entry.url, `${tag}[${attribute}]`, entry.descriptorWidth));
    });
    urlsFromCssText(node.getAttribute("style")).forEach((url) => pushImageItem(items, seen, url, `${tag}[style]`));
  });

  urlsFromCssText(css).forEach((url) => pushImageItem(items, seen, url, "captured CSS"));
  return items;
}

function moduleImageReplacementList(index) {
  return imageReplacements.get(index) || [];
}

function applyImageReplacementsToText(value, replacements) {
  return moduleImageReplacementList(-1).concat(replacements || []).reduce((current, replacement) => {
    if (!replacement?.from || !replacement?.to || !current.includes(replacement.from)) return current;
    return current.split(replacement.from).join(replacement.to);
  }, String(value || ""));
}

function applyImageReplacementsForModule(value, module) {
  return applyImageReplacementsToText(value, moduleImageReplacementList(module.index));
}

function effectiveModuleCss(module, css) {
  return applyImageReplacementsForModule(css, module);
}

function validReplacementTarget(value) {
  try {
    const url = new URL(String(value || "").trim());
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}

function imageIcon() {
  return '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="1.6"/><path d="M21 16l-5.2-5.2a1.3 1.3 0 0 0-1.8 0L7 18"/></svg>';
}

function markModuleLiquidStale(index, reason) {
  const result = liquidResults.get(index);
  if (result?.code) liquidResults.set(index, { ...result, stale: true, staleReason: reason });
  syncModuleCard(index);
  updateBatchControls();
}

function imageReplacementRowMarkup(item, index) {
  const number = String(index + 1).padStart(2, "0");
  const sourceLabel = item.sources.slice(0, 2).join("，");
  const more = item.sources.length > 2 ? ` 等 ${item.sources.length} 处` : "";
  const variantLabel = item.variants?.length > 1 ? `，已合并 ${item.variants.length} 个尺寸` : "";
  return `<article class="image-replacement-row" data-image-index="${index}">
    <div class="image-thumb">
      <img src="${escapeHtml(item.url)}" alt="图片 ${number} 预览" loading="lazy">
      <span>${number}</span>
    </div>
    <div class="image-replacement-fields">
      <div class="image-row-title">
        <strong>图片 ${number}</strong>
        <span>${escapeHtml(sourceLabel + more + variantLabel)}</span>
      </div>
      <label class="settings-field">
        <span>当前链接</span>
        <span class="image-url-line">
          <input type="text" value="${escapeHtml(item.url)}" readonly spellcheck="false">
          <a href="${escapeHtml(item.url)}" class="secondary image-open-link" target="_blank" rel="noopener noreferrer">打开</a>
        </span>
      </label>
      <label class="settings-field">
        <span>替换为</span>
        <span class="image-url-line">
          <input type="url" data-image-new-url placeholder="粘贴新的图片链接，留空则不替换" spellcheck="false">
          <a class="secondary image-open-link" data-image-new-open target="_blank" rel="noopener noreferrer" aria-disabled="true">预览</a>
        </span>
      </label>
    </div>
  </article>`;
}

function updateImageReplacementActions() {
  const rows = Array.from(imageReplacementList.querySelectorAll("[data-image-index]"));
  const hasValidChange = rows.some((row) => {
    const item = activeImageItems[Number(row.dataset.imageIndex)];
    const value = row.querySelector("[data-image-new-url]")?.value.trim() || "";
    return value && value !== item?.url && validReplacementTarget(value);
  });
  applyImageReplacementsButton.disabled = !hasValidChange;
}

function renderImageReplacementRows() {
  imageReplacementCount.textContent = activeImageItems.length ? `${activeImageItems.length} 张图片` : "无图片";
  imageReplacementList.innerHTML = activeImageItems.map(imageReplacementRowMarkup).join("");
  imageReplacementEmpty.hidden = activeImageItems.length > 0;
  updateImageReplacementActions();
}

async function openImageReplacementDrawer(module) {
  activeImageModuleIndex = module.index;
  activeImageItems = [];
  imageReplacementTitle.textContent = `模块 ${String(module.index).padStart(2, "0")} 图片替换`;
  imageReplacementCount.textContent = "读取中";
  imageReplacementSubtitle.textContent = module.heading || module.id || `${module.tag} 模块`;
  imageReplacementList.innerHTML = '<div class="image-replacement-loading">正在读取模块图片链接</div>';
  imageReplacementEmpty.hidden = true;
  applyImageReplacementsButton.disabled = true;
  if (!imageReplacementDialog.open) imageReplacementDialog.showModal();

  const css = await loadModuleCss(module);
  if (activeImageModuleIndex !== module.index) return;
  activeImageItems = collectImageLinks(module, effectiveModuleCss(module, css));
  renderImageReplacementRows();
}

function refreshModuleAfterImageReplacement(module) {
  replacementCorpusCache.delete(module.index);
  updateReplacementCounts();
  const card = moduleList.querySelector(`.module-card[data-index="${module.index}"]`);
  if (!card) return;
  const size = card.querySelector(".module-size");
  if (size) size.textContent = `${(module.size / 1024).toFixed(1)} KB`;
  const detail = card.querySelector(".module-detail");
  if (detail?.dataset.mode === "preview") mountOriginalPreview(detail, module);
  if (detail?.dataset.mode === "source") detail.innerHTML = `<pre><code>${escapeHtml(cleanModuleHtml(module.html))}</code></pre>`;
}

function applyImageReplacementInputs() {
  const module = extraction?.modules.find((item) => item.index === activeImageModuleIndex);
  if (!module) return;
  const next = [];
  imageReplacementList.querySelectorAll("[data-image-index]").forEach((row) => {
    const item = activeImageItems[Number(row.dataset.imageIndex)];
    const target = row.querySelector("[data-image-new-url]")?.value.trim() || "";
    if (item?.url && target && target !== item.url && validReplacementTarget(target)) {
      (item.variants?.length ? item.variants : [item.url]).forEach((from) => {
        if (from && from !== target) next.push({ from, to: target });
      });
    }
  });
  if (!next.length) return;
  const current = moduleImageReplacementList(module.index);
  imageReplacements.set(module.index, [...current, ...next]);
  module.html = applyImageReplacementsToText(module.html, next);
  module.size = new Blob([module.html]).size;
  markModuleLiquidStale(module.index, "image-replacement");
  refreshModuleAfterImageReplacement(module);
  showToast(`模块 ${module.index} 已替换 ${next.length} 张图片`);
  imageReplacementDialog.close();
}

function attributesMarkup(attributes = {}) {
  return Object.entries(attributes)
    .filter(([name]) => !["srcdoc"].includes(name.toLowerCase()))
    .map(([name, value]) => `${name}="${escapeHtml(String(value))}"`)
    .join(" ");
}

function sourceStyleMarkup() {
  const links = extraction.stylesheetLinks?.length
    ? extraction.stylesheetLinks.join("\n")
    : extraction.stylesheets.map((href) => `<link rel="stylesheet" href="${escapeHtml(href)}">`).join("\n");
  const styles = extraction.styleTags?.join("\n") ||
    extraction.inlineStyles?.map((css) => `<style>${css}</style>`).join("\n") || "";
  return `${links}\n${styles}`;
}

function cleanModuleHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("[data-static-opacity], [data-static-visibility], [data-static-transform], [data-static-clip-path]").forEach((node) => {
    node.removeAttribute("data-static-opacity");
    node.removeAttribute("data-static-visibility");
    node.removeAttribute("data-static-transform");
    node.removeAttribute("data-static-clip-path");
  });
  return template.innerHTML;
}

function standaloneDocument(module) {
  const rootAttributes = attributesMarkup(extraction.rootAttributes);
  const bodyAttributes = attributesMarkup(extraction.bodyAttributes);
  return `<!doctype html>\n<html ${rootAttributes}>\n<head>\n<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<base href="${escapeHtml(extraction.url)}">\n${sourceStyleMarkup()}\n</head>\n<body ${bodyAttributes}>\n${cleanModuleHtml(module.html)}\n</body>\n</html>`;
}

function downloadOriginalModule(module) {
  downloadText(
    standaloneDocument(module),
    `${String(module.index).padStart(2, "0")}-${module.id || module.tag}.html`.replace(/[^a-zA-Z0-9._-]/g, "-"),
    "text/html;charset=utf-8"
  );
}

function previewSource(module, capturedCss = "") {
  const rootAttributes = attributesMarkup(extraction.rootAttributes);
  const bodyAttributes = attributesMarkup(extraction.bodyAttributes);
  const isTestimonialModule = module.html.includes("testimonial-card") && module.html.includes("splide__list");
  const testimonialAttribute = isTestimonialModule ? ' data-static-testimonials="true"' : "";
  const staticOverrides = isTestimonialModule ? `<style id="static-testimonial-overrides">
body[data-static-testimonials="true"] .splide__track { overflow: visible !important; }
body[data-static-testimonials="true"] .splide__list { display: grid !important; grid-template-columns: repeat(3, minmax(0, 1fr)) !important; gap: 2rem !important; width: 100% !important; height: auto !important; transform: none !important; }
body[data-static-testimonials="true"] .splide__slide { display: block !important; position: relative !important; width: auto !important; margin: 0 !important; opacity: 1 !important; visibility: visible !important; transform: none !important; }
body[data-static-testimonials="true"] .testimonial-card,
body[data-static-testimonials="true"] .testimonial-card * { opacity: 1 !important; visibility: visible !important; filter: none !important; }
body[data-static-testimonials="true"] .splide__arrows,
body[data-static-testimonials="true"] .splide__pagination { display: none !important; }
@media (max-width: 1024px) { body[data-static-testimonials="true"] .splide__list { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } }
@media (max-width: 600px) { body[data-static-testimonials="true"] .splide__list { grid-template-columns: 1fr !important; gap: 1rem !important; } }
</style>` : "";
  const safeCapturedCss = String(capturedCss || "").replace(/<\/style/gi, "<\\/style");
  const moduleStyle = safeCapturedCss ? `<style data-module-captured-css>${safeCapturedCss}</style>` : "";
  return `<!doctype html><html ${rootAttributes}><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="${escapeHtml(extraction.url)}">${sourceStyleMarkup()}${moduleStyle}${staticOverrides}</head><body ${bodyAttributes}${testimonialAttribute}>${module.html}</body></html>`;
}

async function loadModuleCss(module) {
  if (module.css) return String(module.css);
  const extractionId = extraction?.extractionId;
  if (!extractionId) return "";
  const cacheKey = `${extractionId}:${module.index}`;
  if (moduleCssCache.has(cacheKey)) return moduleCssCache.get(cacheKey);
  const request = fetch(`/api/extract/${encodeURIComponent(extractionId)}/module/${encodeURIComponent(module.index)}/css`)
    .then(async (response) => {
      if (!response.ok) throw new Error("MODULE_CSS_LOAD_FAILED");
      const payload = await response.json();
      return String(payload.css || "");
    })
    .catch(() => "");
  moduleCssCache.set(cacheKey, request);
  return request;
}

function boundedPixelValue(value, fallback, minimum, maximum) {
  const parsed = Number.parseFloat(String(value || ""));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, parsed));
}

function liquidPreviewEnvironmentCss() {
  const environment = extraction?.previewEnvironment || {};
  const rootFontSize = boundedPixelValue(environment.rootFontSize, 10, 6, 24);
  const bodyFontSize = boundedPixelValue(environment.bodyFontSize, 16, 8, 32);
  const bodyLineHeightPixels = boundedPixelValue(environment.bodyLineHeight, bodyFontSize * 1.5, bodyFontSize, bodyFontSize * 2.5);
  const bodyLineHeight = Math.round((bodyLineHeightPixels / bodyFontSize) * 1000) / 1000;
  return `html{font-size:${rootFontSize}px;box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}body{margin:0;min-height:1px;background:#fff;font-size:${bodyFontSize}px;line-height:${bodyLineHeight};overflow:hidden}img,picture,video,canvas,svg{max-width:100%}`;
}

function liquidPreviewSource(result, previewId) {
  const bridge = `<script>
(() => {
  const previewId = ${JSON.stringify(previewId)};
  const send = (type, extra = {}) => parent.postMessage({ type, previewId, ...extra }, '*');
  const measure = () => send('custom-liquid-preview-size', { height: Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0) });
  addEventListener('error', (event) => send('custom-liquid-preview-error', { message: event.message || '脚本运行错误' }));
  addEventListener('unhandledrejection', () => send('custom-liquid-preview-error', { message: '脚本 Promise 运行错误' }));
  document.addEventListener('click', (event) => {
    const link = event.target.closest?.('a[href]');
    if (link && !link.getAttribute('href').startsWith('#')) event.preventDefault();
  });
  document.addEventListener('submit', (event) => event.preventDefault());
  addEventListener('load', measure);
  document.addEventListener('DOMContentLoaded', measure, { once: true });
  new ResizeObserver(measure).observe(document.documentElement);
  setTimeout(measure, 500);
})();
</script>`;
  return `<!doctype html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><base href="${escapeHtml(extraction.url)}"><style>${liquidPreviewEnvironmentCss()}</style></head><body>${result.code}${bridge}</body></html>`;
}

function closePreview(detail) {
  const state = previewStates.get(detail);
  state?.observer?.disconnect();
  if (state?.objectUrl) URL.revokeObjectURL(state.objectUrl);
  if (state?.previewId) liquidPreviewBridges.delete(state.previewId);
  previewStates.delete(detail);
}

function restoreStaticVisibility(documentRoot, moduleRoot) {
  let restored = 0;
  const readStyle = (node) => documentRoot.defaultView.getComputedStyle(node);
  const annotated = moduleRoot.matches("[data-static-opacity]")
    ? [moduleRoot, ...moduleRoot.querySelectorAll("[data-static-opacity]")]
    : Array.from(moduleRoot.querySelectorAll("[data-static-opacity]"));

  annotated.forEach((node) => {
    const before = readStyle(node);
    const opacity = node.getAttribute("data-static-opacity");
    const visibility = node.getAttribute("data-static-visibility");
    const transform = node.getAttribute("data-static-transform");
    const clipPath = node.getAttribute("data-static-clip-path");
    if ((Number(before.opacity) < 0.01 || before.visibility === "hidden") && Number(opacity) > 0.01 && visibility === "visible") restored += 1;
    node.style.setProperty("animation", "none", "important");
    node.style.setProperty("transition", "none", "important");
    if (opacity) node.style.setProperty("opacity", opacity, "important");
    if (visibility) node.style.setProperty("visibility", visibility, "important");
    if (transform) node.style.setProperty("transform", transform, "important");
    if (clipPath) node.style.setProperty("clip-path", clipPath, "important");
  });

  const testimonialCards = moduleRoot.querySelectorAll(".testimonial-card");
  if (testimonialCards.length) {
    moduleRoot.querySelectorAll(".splide__list").forEach((node) => {
      node.style.setProperty("transform", "none", "important");
      node.style.setProperty("height", "auto", "important");
    });
    moduleRoot.querySelectorAll(".splide__slide, .testimonial-card, .testimonial-card *").forEach((node) => {
      node.style.setProperty("animation", "none", "important");
      node.style.setProperty("transition", "none", "important");
      node.style.setProperty("opacity", "1", "important");
      node.style.setProperty("visibility", "visible", "important");
      node.style.setProperty("filter", "none", "important");
    });
  }

  const elements = [moduleRoot, ...moduleRoot.querySelectorAll("*")];
  const isVisible = (node) => {
    const style = readStyle(node);
    const rect = node.getBoundingClientRect();
    if (style.display === "none" || style.visibility !== "visible" || Number(style.opacity) < 0.01 || rect.width < 1 || rect.height < 1) return false;
    for (let parent = node.parentElement; parent && parent !== documentRoot.body; parent = parent.parentElement) {
      const parentStyle = readStyle(parent);
      if (parentStyle.display === "none" || parentStyle.visibility !== "visible" || Number(parentStyle.opacity) < 0.01) return false;
    }
    return true;
  };
  const hasOwnText = (node) => Array.from(node.childNodes).some((child) => child.nodeType === 3 && child.textContent.trim());
  const hasVisibleContent = elements.some((node) => isVisible(node) && (
    hasOwnText(node) || node.matches("img[src], picture, video, canvas, svg")
  ));

  if (!hasVisibleContent && (moduleRoot.textContent.trim() || moduleRoot.querySelector("img, picture, video, canvas, svg"))) {
    const hiddenCandidates = elements.filter((node) => {
      if (node.hidden || node.getAttribute("aria-hidden") === "true" || node.closest("[aria-hidden='true']")) return false;
      const style = readStyle(node);
      const hasContent = node.textContent.trim() || node.querySelector("img, picture, video, canvas, svg");
      return hasContent && style.display !== "none" && (style.visibility === "hidden" || Number(style.opacity) < 0.01);
    });
    const topLevelHidden = hiddenCandidates.filter((node) => !hiddenCandidates.some((candidate) => candidate !== node && candidate.contains(node)));
    topLevelHidden.slice(0, 8).forEach((node) => {
      node.style.setProperty("animation", "none", "important");
      node.style.setProperty("transition", "none", "important");
      node.style.setProperty("opacity", "1", "important");
      node.style.setProperty("visibility", "visible", "important");
      node.style.setProperty("transform", "none", "important");
      node.style.setProperty("clip-path", "none", "important");
      restored += 1;
    });
  }
  return restored;
}

function resizePreview(detail) {
  const state = previewStates.get(detail);
  if (!state) return;
  const { iframe, stage, targetWidth } = state;

  if (state.kind === "liquid") {
    const stageWidth = stage.clientWidth;
    const scale = Math.min(1, stageWidth / targetWidth);
    const renderedWidth = targetWidth * scale;
    const contentHeight = Math.max(240, state.contentHeight || 720);
    iframe.style.width = `${targetWidth}px`;
    iframe.style.height = `${contentHeight}px`;
    iframe.style.left = `${Math.max(0, (stageWidth - renderedWidth) / 2)}px`;
    iframe.style.transform = `scale(${scale})`;
    stage.style.height = `${Math.ceil(contentHeight * scale)}px`;
    return;
  }

  if (!iframe.contentDocument) return;
  const documentRoot = iframe.contentDocument;
  const moduleRoot = documentRoot.body?.firstElementChild;
  if (!moduleRoot) return;
  state.restoredCount = Math.max(state.restoredCount || 0, restoreStaticVisibility(documentRoot, moduleRoot));
  state.testimonialCount = moduleRoot.querySelectorAll(".testimonial-card").length;
  iframe.style.width = `${targetWidth}px`;
  iframe.style.height = "1000px";
  requestAnimationFrame(() => {
    const rect = moduleRoot.getBoundingClientRect();
    const contentHeight = Math.max(1, Math.ceil(rect.bottom));
    const stageWidth = stage.clientWidth;
    const scale = Math.min(1, stageWidth / targetWidth);
    const renderedWidth = targetWidth * scale;
    iframe.style.height = `${contentHeight}px`;
    iframe.style.left = `${Math.max(0, (stageWidth - renderedWidth) / 2)}px`;
    iframe.style.transform = `scale(${scale})`;
    stage.style.height = `${Math.ceil(contentHeight * scale)}px`;

    const failedImages = Array.from(documentRoot.images).filter((image) => {
      const source = image.currentSrc || image.getAttribute("src");
      return source && image.complete && image.naturalWidth === 0;
    }).length;
    const status = detail.querySelector(".preview-resource-status");
    if (status) {
      const statusParts = [];
      if (state.testimonialCount) statusParts.push(`静态展示 ${state.testimonialCount} 条评论`);
      if (state.restoredCount) statusParts.push(`已恢复 ${state.restoredCount} 个动画层`);
      if (failedImages) statusParts.push(`${failedImages} 张图片加载失败`);
      status.textContent = statusParts.join("；") || "资源已加载";
      status.dataset.state = failedImages ? "warning" : "ready";
    }
  });
}

function previewHeader(sourceWidth, interactive) {
  return `<div class="preview-header">
    <div class="preview-context"><strong class="preview-width-label">${sourceWidth}px 视口</strong><span>${interactive ? "隔离预览，允许运行生成的内联脚本" : "静态预览，不执行来源脚本"}</span></div>
    <div class="preview-options" aria-label="预览宽度">
      <button type="button" class="active" data-preview-width="${sourceWidth}" aria-pressed="true">来源</button>
      <button type="button" data-preview-width="1024" aria-pressed="false">平板</button>
      <button type="button" data-preview-width="390" aria-pressed="false">手机</button>
    </div>
    <span class="preview-resource-status">正在加载资源</span>
  </div>`;
}

function setPreviewWidth(detail, width) {
  const state = previewStates.get(detail);
  if (!state) return;
  state.targetWidth = width;
  detail.querySelectorAll("[data-preview-width]").forEach((button) => {
    const isActive = Number(button.dataset.previewWidth) === width;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  detail.querySelector(".preview-width-label").textContent = `${width}px 视口`;
  resizePreview(detail);
}

async function mountOriginalPreview(detail, module) {
  closePreview(detail);
  const sourceWidth = extraction.viewport?.width || 1440;
  detail.innerHTML = `${previewHeader(sourceWidth, false)}<div class="preview-stage preview-stage-loading"><div class="preview-loading">正在加载模块样式</div></div>`;
  const capturedCss = await loadModuleCss(module);
  if (detail.dataset.mode !== "preview") return;
  detail.innerHTML = `${previewHeader(sourceWidth, false)}<div class="preview-stage"><iframe title="模块静态预览" sandbox="allow-same-origin"></iframe></div>`;
  const iframe = detail.querySelector("iframe");
  const stage = detail.querySelector(".preview-stage");
  const objectUrl = URL.createObjectURL(new Blob([previewSource(module, effectiveModuleCss(module, capturedCss))], { type: "text/html;charset=utf-8" }));
  const state = { kind: "original", iframe, stage, targetWidth: sourceWidth, observer: null, restoredCount: 0, objectUrl };
  previewStates.set(detail, state);
  state.observer = new ResizeObserver(() => resizePreview(detail));
  state.observer.observe(stage);
  iframe.addEventListener("load", async () => {
    await iframe.contentDocument?.fonts?.ready.catch(() => {});
    resizePreview(detail);
    setTimeout(() => resizePreview(detail), 600);
  }, { once: true });
  iframe.src = objectUrl;
}

function mountLiquidPreview(detail, module, result) {
  closePreview(detail);
  const sourceWidth = extraction.viewport?.width || 1440;
  const previewId = uniqueId();
  detail.innerHTML = `${previewHeader(sourceWidth, true)}<div class="preview-stage"><iframe title="Custom Liquid 隔离预览" sandbox="allow-scripts"></iframe></div>`;
  const iframe = detail.querySelector("iframe");
  const stage = detail.querySelector(".preview-stage");
  const objectUrl = URL.createObjectURL(new Blob([liquidPreviewSource(result, previewId)], { type: "text/html;charset=utf-8" }));
  const state = { kind: "liquid", iframe, stage, detail, module, targetWidth: sourceWidth, contentHeight: 720, observer: null, objectUrl, previewId };
  previewStates.set(detail, state);
  liquidPreviewBridges.set(previewId, state);
  state.observer = new ResizeObserver(() => resizePreview(detail));
  state.observer.observe(stage);
  iframe.addEventListener("load", () => resizePreview(detail), { once: true });
  iframe.src = objectUrl;
}

window.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object" || !data.previewId) return;
  const state = liquidPreviewBridges.get(data.previewId);
  if (!state || event.source !== state.iframe.contentWindow) return;
  if (data.type === "custom-liquid-preview-size") {
    state.contentHeight = Math.max(1, Math.min(20000, Number(data.height) || 720));
    resizePreview(state.detail);
    const status = state.detail.querySelector(".preview-resource-status");
    if (status?.dataset.state !== "warning") {
      status.textContent = "脚本已运行，预览已加载";
      status.dataset.state = "ready";
    }
  }
  if (data.type === "custom-liquid-preview-error") {
    const status = state.detail.querySelector(".preview-resource-status");
    if (status) {
      status.textContent = `脚本错误：${String(data.message || "运行失败").slice(0, 80)}`;
      status.dataset.state = "warning";
    }
  }
});

function setViewState(card, mode) {
  card.dataset.view = mode;
  card.querySelectorAll("[data-view]").forEach((button) => {
    const isActive = button.dataset.view === mode;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function showActionFeedback(button, message) {
  const originalLabel = button.dataset.originalLabel || button.textContent;
  button.dataset.originalLabel = originalLabel;
  clearTimeout(button.feedbackTimer);
  button.textContent = message;
  button.classList.add("is-success");
  button.feedbackTimer = setTimeout(() => {
    button.textContent = originalLabel;
    button.classList.remove("is-success");
  }, 1600);
}

function queueOriginalPreview(detail, module) {
  detail.hidden = false;
  detail.dataset.mode = "preview";
  detail.innerHTML = '<div class="preview-placeholder" aria-label="预览正在等待加载"><div class="preview-placeholder-lines"><span></span><span></span><span></span></div><p>预览即将加载</p></div>';
  detail.previewModule = module;
  if (previewLoadObserver) previewLoadObserver.observe(detail);
  else mountOriginalPreview(detail, module);
}

function resetRenderedPreviews() {
  previewLoadObserver?.disconnect();
  previewLoadObserver = null;
  moduleList.querySelectorAll(".module-detail").forEach((detail) => closePreview(detail));
}

function initializeDefaultPreviews() {
  if ("IntersectionObserver" in window) {
    previewLoadObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const detail = entry.target;
        previewLoadObserver.unobserve(detail);
        if (detail.dataset.mode === "preview" && !detail.querySelector("iframe") && includedModules.has(Number(detail.closest(".module-card")?.dataset.index))) {
          mountOriginalPreview(detail, detail.previewModule);
        }
      });
    }, { rootMargin: "700px 0px" });
  }

  moduleList.querySelectorAll(".module-card").forEach((card) => {
    const index = Number(card.dataset.index);
    if (!includedModules.has(index)) return;
    const module = extraction.modules.find((item) => item.index === index);
    const detail = card.querySelector(".module-detail");
    setViewState(card, "preview");
    queueOriginalPreview(detail, module);
  });
}

function eyeIcon(included) {
  return included
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.8"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a15.8 15.8 0 0 1-2.3 3.1M6.2 6.3C3.8 8 2.5 12 2.5 12s3.4 6 9.5 6a9.8 9.8 0 0 0 3.1-.5M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
}

function moduleTextCorpus(module) {
  if (replacementCorpusCache.has(module.index)) return replacementCorpusCache.get(module.index);
  const template = document.createElement("template");
  template.innerHTML = module.html;
  template.content.querySelectorAll("script, style, noscript").forEach((node) => node.remove());
  const attributes = Array.from(template.content.querySelectorAll("[alt], [title], [aria-label], [placeholder], [value]"), (node) =>
    ["alt", "title", "aria-label", "placeholder", "value"].map((name) => node.getAttribute(name) || "").join(" ")
  ).join(" ");
  const corpus = `${template.content.textContent || ""} ${attributes}`;
  replacementCorpusCache.set(module.index, corpus);
  return corpus;
}

function countLiteral(source, search) {
  if (!search) return 0;
  return source.split(search).length - 1;
}

function collectReplacements() {
  return replacementRows.filter((row) => row.from).map(({ from, to }) => ({ from, to }));
}

function replacementRowMarkup(row, index) {
  return `<div class="replacement-row" data-replacement-id="${escapeHtml(row.id)}">
    <label><span>原文本</span><input type="text" data-replacement-field="from" value="${escapeHtml(row.from)}" placeholder="例如：Fungal Nail Patches"></label>
    <span class="replacement-arrow" aria-hidden="true">→</span>
    <label><span>替换为</span><input type="text" data-replacement-field="to" value="${escapeHtml(row.to)}" placeholder="输入新的产品名或成分名"></label>
    <span class="replacement-match" data-replacement-match>${row.from ? "正在统计" : "等待输入"}</span>
    <button type="button" class="icon-button replacement-remove" data-remove-replacement aria-label="删除第 ${index + 1} 条替换">×</button>
  </div>`;
}

function renderReplacementRows() {
  if (!replacementRows.length) replacementRows = [{ id: uniqueId(), from: "", to: "" }];
  replacementList.innerHTML = replacementRows.map(replacementRowMarkup).join("");
  updateReplacementCounts();
}

function updateReplacementCounts() {
  replacementRows.forEach((row) => {
    const count = !row.from || !extraction ? 0 : extraction.modules
      .filter((module) => includedModules.has(module.index))
      .reduce((sum, module) => sum + countLiteral(moduleTextCorpus(module), row.from), 0);
    const element = replacementList.querySelector(`[data-replacement-id="${CSS.escape(row.id)}"] [data-replacement-match]`);
    if (element) element.textContent = row.from ? `匹配 ${count} 处` : "等待输入";
  });
}

function markLiquidResultsStale() {
  liquidResults.forEach((result, index) => {
    if (result.code) liquidResults.set(index, { ...result, stale: true, staleReason: "replacement" });
  });
  moduleList.querySelectorAll(".module-card").forEach((card) => syncModuleCard(Number(card.dataset.index)));
  updateBatchControls();
}

function liquidStatusMarkup(index) {
  if (!includedModules.has(index)) return '<span class="status-dot"></span><span>已排除，不会发送给模型</span>';
  const result = liquidResults.get(index);
  if (!result) return "";
  if (result.status === "loading") return '<span class="status-pulse" aria-hidden="true"></span><span>正在精简重复资源并请求模型，大模块会先压缩再发送</span>';
  if (result.status === "error") {
    const kept = result.code ? "，已保留上一次结果" : "";
    return `<span class="status-dot"></span><span>${escapeHtml(result.error || "生成失败")}${kept}</span><button type="button" data-action="retry-liquid">重试生成</button>`;
  }
  if (result.code && result.stale) {
    const message = result.staleReason === "review-limit"
      ? "评论生成数量已改变，需要重新生成"
      : result.staleReason === "image-replacement"
        ? "图片链接已替换，需要重新生成"
      : "全局替换已改变，需要重新生成";
    return `<span class="status-dot"></span><span>${message}</span>`;
  }
  if (result.code) {
    const usage = result.usage?.total_tokens ? `，${Number(result.usage.total_tokens).toLocaleString()} tokens` : "";
    const summary = String(result.summary || "Custom Liquid 已生成").replace(/[。；，,\s]+$/u, "");
    const reviewAudit = result.reviewAudit;
    const reviewStatus = reviewAudit
      ? `，${reviewAudit.repaired ? "已自动补全并校验" : "已校验"} ${reviewAudit.outputCount} 条评论与左右按钮${reviewAudit.availableCount > reviewAudit.sourceCount ? `（从 ${reviewAudit.availableCount} 条中选择）` : ""}`
      : "";
    const shopifyAudit = result.shopifyAudit;
    const shopifyStatus = shopifyAudit
      ? `，Shopify 大小 ${(shopifyAudit.bytes / 1024).toFixed(1)} KB${shopifyAudit.compacted ? "（已自动压缩）" : ""}`
      : "";
    const requestAudit = result.requestAudit;
    const requestStages = requestAudit ? [requestAudit.sourceBytes] : [];
    if (requestAudit?.selectedSourceBytes < requestAudit?.sourceBytes) requestStages.push(requestAudit.selectedSourceBytes);
    if (requestAudit?.optimizedSourceBytes < requestStages.at(-1)) requestStages.push(requestAudit.optimizedSourceBytes);
    const requestStatus = requestStages.length > 1
      ? `，发送内容 ${requestStages.map((bytes) => (bytes / 1024).toFixed(1)).join("→")} KB`
      : "";
    const warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
    const warningMarkup = warnings.length
      ? `<details class="liquid-warnings"><summary>查看 ${warnings.length} 条提示</summary><ul>${warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></details>`
      : "";
    return `<span class="status-dot"></span><span>${escapeHtml(summary)}${reviewStatus}${shopifyStatus}${requestStatus}${usage}</span>${warningMarkup}`;
  }
  return "";
}

function hasLiquidCode(index) {
  return Boolean(liquidResults.get(index)?.code);
}

function syncModuleCard(index) {
  const card = moduleList.querySelector(`.module-card[data-index="${index}"]`);
  if (!card) return;
  const included = includedModules.has(index);
  const result = liquidResults.get(index);
  const hasCode = Boolean(result?.code);
  const loading = result?.status === "loading";
  card.classList.toggle("is-excluded", !included);
  card.dataset.included = String(included);

  const visibilityButton = card.querySelector("[data-action='toggle-inclusion']");
  visibilityButton.innerHTML = eyeIcon(included);
  visibilityButton.setAttribute("aria-pressed", String(included));
  visibilityButton.setAttribute("aria-label", included ? `排除模块 ${index}` : `恢复模块 ${index}`);
  visibilityButton.title = included ? "排除模块，不产生 AI 用量" : "恢复模块，允许 AI 转换";

  card.querySelectorAll("[data-view='liquid-preview'], [data-view='liquid-code']").forEach((button) => {
    button.disabled = !included || !hasCode;
  });
  const generateButton = card.querySelector("[data-action='generate-liquid']");
  generateButton.disabled = !included || !aiConfig.configured || loading || batchActive;
  generateButton.textContent = loading ? "正在生成" : hasCode ? "重新生成 Liquid" : "生成 Liquid";
  card.querySelector("[data-action='copy-liquid']").disabled = !included || !hasCode;
  card.querySelector("[data-action='download-liquid']").disabled = !included || !hasCode;
  const reviewLimitSelect = card.querySelector("[data-review-limit]");
  if (reviewLimitSelect) reviewLimitSelect.disabled = !included || loading || batchActive;

  const status = card.querySelector("[data-liquid-status]");
  const statusMarkup = liquidStatusMarkup(index);
  status.hidden = !statusMarkup;
  status.innerHTML = statusMarkup;
  status.dataset.state = !included ? "excluded" : loading ? "loading" : result?.status === "error" ? "error" : result?.stale ? "warning" : hasCode ? "success" : "idle";
}

function selectedPendingModules() {
  if (!extraction) return [];
  return extraction.modules.filter((module) => {
    const result = liquidResults.get(module.index);
    return includedModules.has(module.index) && (!result?.code || result.stale || result.status === "error");
  });
}

function liquidCodeForModules(modules) {
  return modules.map((module) => {
    const label = String(module.heading || module.id || module.tag).replace(/[{}%<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 90);
    return `{% comment %} Module ${String(module.index).padStart(2, "0")}: ${label} {% endcomment %}\n${liquidResults.get(module.index).code.trim()}`;
  }).join("\n\n");
}

function selectedLiquidBundle() {
  if (!extraction) return { modules: [], code: "", bytes: 0, complete: false };
  const modules = extraction.modules.filter((module) => includedModules.has(module.index));
  const complete = modules.length > 0 && modules.every((module) => {
    const result = liquidResults.get(module.index);
    return Boolean(result?.code) && !result.stale && result.status !== "error" && result.status !== "loading";
  });
  if (!complete) return { modules, code: "", bytes: 0, complete: false };

  const code = liquidCodeForModules(modules);
  return { modules, code, bytes: new Blob([code]).size, complete: true };
}

function formatByteSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function chunkModules(modules, size) {
  const groups = [];
  for (let index = 0; index < modules.length; index += size) groups.push(modules.slice(index, index + size));
  return groups;
}

function resetLiquidGroups(bundle) {
  const size = Math.max(1, Math.min(liquidGroupSize, bundle.modules.length));
  liquidGroupState = {
    signature: bundle.modules.map((module) => module.index).join(","),
    groups: chunkModules(bundle.modules, size).map((modules) => modules.map((module) => module.index))
  };
}

function renderLiquidGroups(bundle) {
  if (!bundle.complete) {
    liquidGroups.hidden = true;
    liquidGroupList.innerHTML = "";
    return;
  }

  const signature = bundle.modules.map((module) => module.index).join(",");
  if (liquidGroupState.signature !== signature || !liquidGroupState.groups.length) resetLiquidGroups(bundle);
  const selectedSize = Math.max(1, Math.min(liquidGroupSize, bundle.modules.length));
  liquidGroupSizeSelect.innerHTML = Array.from({ length: bundle.modules.length }, (_, index) => index + 1)
    .map((value) => `<option value="${value}"${value === selectedSize ? " selected" : ""}>${value}</option>`)
    .join("");

  const moduleByIndex = new Map(bundle.modules.map((module) => [module.index, module]));
  liquidGroupList.innerHTML = liquidGroupState.groups.map((indexes, groupIndex) => {
    const modules = indexes.map((index) => moduleByIndex.get(index)).filter(Boolean);
    const code = liquidCodeForModules(modules);
    const bytes = new Blob([code]).size;
    const overLimit = bytes > SHOPIFY_CUSTOM_LIQUID_SAFE_BYTES;
    const moduleLabels = modules.map((module) => String(module.index).padStart(2, "0")).join("、");
    const splitOptions = modules.length > 1
      ? `<label class="liquid-group-split"><span>继续拆分</span><select data-split-liquid-group="${groupIndex}" aria-label="拆分第 ${groupIndex + 1} 组"><option value="">选择数量</option>${Array.from({ length: modules.length - 1 }, (_, index) => index + 1).map((value) => `<option value="${value}">每组 ${value} 个</option>`).join("")}</select></label>`
      : "";
    return `<article class="liquid-group-row" data-group-index="${groupIndex}" data-state="${overLimit ? "warning" : "ready"}">
      <header class="liquid-group-row-head">
        <div>
          <h5>第 ${groupIndex + 1} 组 <span>模块 ${moduleLabels}</span></h5>
          <p>${modules.length} 个模块 · ${formatByteSize(bytes)}${overLimit ? " · 超出单个 Custom Liquid 容量，请继续拆分" : " · 可直接粘贴"}</p>
        </div>
        <div class="liquid-group-actions">
          ${splitOptions}
          <button type="button" class="secondary" data-copy-liquid-group="${groupIndex}"${overLimit ? " disabled title=\"请先拆分此组\"" : ""}>复制第 ${groupIndex + 1} 组</button>
        </div>
      </header>
      <textarea class="liquid-group-code" readonly spellcheck="false" wrap="off" aria-label="第 ${groupIndex + 1} 组 Liquid 代码">${escapeHtml(code)}</textarea>
    </article>`;
  }).join("");
  liquidGroups.hidden = false;
}

function updateBatchControls() {
  const total = extraction?.modules.length || 0;
  const selected = includedModules.size;
  const pending = selectedPendingModules().length;
  selectionCount.textContent = `已选择 ${selected} / ${total} 个模块`;
  generateSelectedButton.disabled = !extraction || !aiConfig.configured || batchActive || pending === 0;
  if (!aiConfig.configured) generateSelectedButton.textContent = "配置模型后生成";
  else if (batchActive) generateSelectedButton.textContent = "正在生成选中模块";
  else if (!pending && selected) generateSelectedButton.textContent = "选中模块已全部生成";
  else generateSelectedButton.textContent = `生成 ${pending} 个模块`;

  const bundle = selectedLiquidBundle();
  const generated = bundle.modules.filter((module) => {
    const result = liquidResults.get(module.index);
    return Boolean(result?.code) && !result.stale && result.status !== "error" && result.status !== "loading";
  }).length;
  copySelectedLiquidButton.disabled = batchActive || !bundle.complete;
  copySelectedLiquidButton.dataset.ready = String(bundle.complete);
  copySelectedLiquidButton.title = bundle.complete
    ? `按页面顺序复制 ${bundle.modules.length} 个模块的完整 Liquid`
    : selected
      ? `还需生成 ${selected - generated} 个选中模块`
      : "请先选择并生成模块";
  combinedLiquidMeta.hidden = !selected;
  combinedLiquidMeta.dataset.state = bundle.complete && bundle.bytes > SHOPIFY_CUSTOM_LIQUID_SAFE_BYTES ? "warning" : bundle.complete ? "ready" : "pending";
  combinedLiquidMeta.textContent = bundle.complete
    ? `已合并 ${bundle.modules.length} 个模块 · ${formatByteSize(bundle.bytes)}${bundle.bytes > SHOPIFY_CUSTOM_LIQUID_SAFE_BYTES ? " · 超出单个 Custom Liquid 容量" : ""}`
    : `Liquid 已就绪 ${generated} / ${selected}`;
  if (bundle.complete) {
    copySelectedLiquidButton.textContent = bundle.bytes > SHOPIFY_CUSTOM_LIQUID_SAFE_BYTES ? "查看分组复制" : "复制全部 Liquid";
  } else {
    copySelectedLiquidButton.textContent = "复制全部 Liquid";
  }
  renderLiquidGroups(bundle);
  cancelGenerationButton.hidden = !batchActive;
  moduleList.querySelectorAll(".module-card").forEach((card) => syncModuleCard(Number(card.dataset.index)));
}

function showModuleView(card, module, mode) {
  if (!includedModules.has(module.index)) return;
  const detail = card.querySelector(".module-detail");
  const result = liquidResults.get(module.index);
  if ((mode === "liquid-preview" || mode === "liquid-code") && !result?.code) return;
  previewLoadObserver?.unobserve(detail);
  closePreview(detail);
  detail.hidden = false;
  detail.dataset.mode = mode;
  setViewState(card, mode);

  if (mode === "preview") mountOriginalPreview(detail, module);
  if (mode === "source") detail.innerHTML = `<pre><code>${escapeHtml(cleanModuleHtml(module.html))}</code></pre>`;
  if (mode === "liquid-preview") mountLiquidPreview(detail, module, result);
  if (mode === "liquid-code") detail.innerHTML = `<div class="code-header"><strong>Custom Liquid 代码</strong><span>${(new Blob([result.code]).size / 1024).toFixed(1)} KB</span></div><pre><code>${escapeHtml(result.code)}</code></pre>`;
}

function selectedReviewLimit(module) {
  if (!module.reviewMeta?.hasImages || module.reviewMeta.count < 2) return undefined;
  if (!reviewLimits.has(module.index)) reviewLimits.set(module.index, Math.min(3, module.reviewMeta.count));
  return reviewLimits.get(module.index);
}

function reviewLimitMarkup(module) {
  if (!module.reviewMeta?.hasImages || module.reviewMeta.count < 2) return "";
  const total = module.reviewMeta.count;
  const selected = selectedReviewLimit(module);
  const values = [...new Set([2, 3, 6, 9, 12, total].filter((value) => value <= total))].sort((a, b) => a - b);
  const options = values.map((value) => {
    const label = value === total ? `全部 ${total} 条` : `${value} 条`;
    return `<option value="${value}"${value === selected ? " selected" : ""}>${label}</option>`;
  }).join("");
  return `<label class="review-limit-control">
    <span class="review-limit-label">生成评论数</span>
    <select data-review-limit aria-label="模块 ${module.index} 生成评论数量">${options}</select>
    <span class="review-limit-total">原始 ${total} 条</span>
  </label>`;
}

function renderModules(query = "") {
  resetRenderedPreviews();
  const term = query.trim().toLowerCase();
  const filtered = extraction.modules.filter((module) =>
    [module.id, module.heading, module.tag, ...module.classes].join(" ").toLowerCase().includes(term)
  );

  moduleList.innerHTML = filtered.map((module) => {
    const label = module.heading || module.id || `${module.tag} 模块`;
    const selector = [module.tag, module.id ? `#${module.id}` : "", ...module.classes.slice(0, 2).map((item) => `.${item}`)].join("");
    const included = includedModules.has(module.index);
    return `<article class="module-card${included ? "" : " is-excluded"}" data-index="${module.index}" data-included="${included}">
      <div class="module-summary">
        <span class="module-number">${String(module.index).padStart(2, "0")}</span>
        <div class="module-identity">
          <div class="tags"><span class="tag-name">${escapeHtml(module.tag)}</span>${module.shopifySection ? '<span class="shopify-tag">Shopify section</span>' : ""}</div>
          <h3>${escapeHtml(label)}</h3>
          <code>${escapeHtml(selector)}</code>
        </div>
        <div class="module-meta">
          <span class="module-size">${(module.size / 1024).toFixed(1)} KB</span>
          <button type="button" class="image-replace-toggle" data-action="replace-images" aria-label="替换模块 ${module.index} 的图片" title="替换图片">${imageIcon()}</button>
          <button type="button" class="visibility-toggle" data-action="toggle-inclusion" aria-pressed="${included}" aria-label="${included ? `排除模块 ${module.index}` : `恢复模块 ${module.index}`}">${eyeIcon(included)}</button>
        </div>
      </div>
      <p class="excluded-note">模块已排除，不会发送给模型。点击眼睛图标可恢复。</p>
      <div class="module-toolbar">
        ${reviewLimitMarkup(module)}
        <div class="view-controls" role="group" aria-label="模块视图">
          <button type="button" data-action="preview" data-view="preview" aria-pressed="true">原始预览</button>
          <button type="button" data-action="source" data-view="source" aria-pressed="false">原始源码</button>
          <button type="button" data-action="liquid-preview" data-view="liquid-preview" aria-pressed="false" disabled>Liquid 预览</button>
          <button type="button" data-action="liquid-code" data-view="liquid-code" aria-pressed="false" disabled>Liquid 代码</button>
        </div>
        <div class="module-actions liquid-actions" role="group" aria-label="Custom Liquid 操作">
          <button type="button" data-action="generate-liquid" class="ai-module-button">生成 Liquid</button>
          <button type="button" data-action="copy-liquid" class="copy-button" disabled>复制 Liquid</button>
          <button type="button" data-action="download-liquid" disabled>下载 Liquid</button>
        </div>
        <div class="module-actions original-actions" role="group" aria-label="原始模块导出">
          <button type="button" data-action="download-original">下载原始文档</button>
          <button type="button" data-action="copy-document">复制原始文档</button>
          <button type="button" data-action="copy-original">复制原始 HTML</button>
        </div>
      </div>
      <div class="liquid-status" data-liquid-status role="status" aria-live="polite" hidden></div>
      <div class="module-detail" data-mode="preview"></div>
    </article>`;
  }).join("");

  if (!filtered.length) {
    moduleList.innerHTML = '<div class="no-results"><h3>没有匹配模块</h3><p>换一个 id、class 或标题关键词试试。</p></div>';
    return;
  }
  filtered.forEach((module) => syncModuleCard(module.index));
  initializeDefaultPreviews();
  updateBatchControls();
}

function setBatchProgress({ title, detail, completed, total }) {
  batchProgress.hidden = false;
  batchProgressTitle.textContent = title;
  batchProgressDetail.textContent = detail;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  batchProgressBar.style.width = `${percent}%`;
  batchProgressTrack.setAttribute("aria-valuenow", String(percent));
}

async function generateLiquid(module, { signal, reveal = true } = {}) {
  const previous = liquidResults.get(module.index);
  liquidResults.set(module.index, { ...previous, status: "loading", error: "" });
  syncModuleCard(module.index);

  try {
    const css = await loadModuleCss(module);
    const response = await fetch("/api/convert", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        extractionId: extraction.extractionId,
        moduleIndex: module.index,
        sourceUrl: extraction.url,
        module,
        css,
        reviewLimit: selectedReviewLimit(module),
        replacements: collectReplacements(),
        imageReplacements: moduleImageReplacementList(module.index)
      }),
      signal
    });
    const data = await response.json();
    if (!response.ok) {
      const error = new Error(data.error || "Custom Liquid 生成失败");
      error.code = data.code;
      error.retryable = data.retryable;
      throw error;
    }
    liquidResults.set(module.index, { ...data, status: "success", stale: false });
    syncModuleCard(module.index);
    updateBatchControls();
    if (reveal) {
      const card = moduleList.querySelector(`.module-card[data-index="${module.index}"]`);
      if (card) showModuleView(card, module, "liquid-preview");
    }
    return { ok: true, data };
  } catch (error) {
    if (error.name === "AbortError") {
      if (previous) liquidResults.set(module.index, previous);
      else liquidResults.delete(module.index);
      syncModuleCard(module.index);
      return { ok: false, cancelled: true };
    }
    liquidResults.set(module.index, {
      ...previous,
      status: "error",
      stale: Boolean(previous?.code),
      error: error.message,
      errorCode: error.code || "CONVERSION_FAILED",
      retryable: error.retryable !== false
    });
    syncModuleCard(module.index);
    updateBatchControls();
    return { ok: false, error };
  }
}

async function generateSelectedModules() {
  const pending = selectedPendingModules();
  if (!pending.length || batchActive) return;
  batchController = new AbortController();
  batchActive = true;
  updateBatchControls();
  let completed = 0;
  let successes = 0;
  let failures = 0;
  setBatchProgress({ title: "开始生成 Custom Liquid", detail: `共 ${pending.length} 个模块，将按顺序发送以控制 API 用量`, completed, total: pending.length });

  const fatalCodes = new Set([
    "DEEPSEEK_NOT_CONFIGURED", "DEEPSEEK_AUTH_FAILED", "DEEPSEEK_BALANCE_EMPTY",
    "DEEPSEEK_RATE_LIMITED", "DEEPSEEK_OVERLOADED", "DEEPSEEK_SERVER_ERROR",
    "EXTRACTION_EXPIRED"
  ]);

  for (const module of pending) {
    if (batchController.signal.aborted) break;
    setBatchProgress({
      title: `正在生成模块 ${module.index}`,
      detail: `${completed + 1} / ${pending.length}，${module.heading || module.id || module.tag}`,
      completed,
      total: pending.length
    });
    const result = await generateLiquid(module, { signal: batchController.signal, reveal: false });
    if (result.cancelled) break;
    completed += 1;
    if (result.ok) successes += 1;
    else failures += 1;
    if (fatalCodes.has(result.error?.code)) break;
  }

  const cancelled = batchController.signal.aborted;
  batchActive = false;
  batchController = null;
  updateBatchControls();
  setBatchProgress({
    title: cancelled ? "已停止生成" : failures ? "批量生成已结束" : "选中模块已生成",
    detail: `成功 ${successes} 个，失败 ${failures} 个${cancelled ? "，未开始的模块不会产生费用" : ""}`,
    completed,
    total: pending.length
  });
  if (!cancelled && !failures) showToast(`已生成 ${successes} 个 Custom Liquid 模块`);
}

function toggleModuleInclusion(card, module) {
  const detail = card.querySelector(".module-detail");
  if (includedModules.has(module.index)) {
    includedModules.delete(module.index);
    previewLoadObserver?.unobserve(detail);
    closePreview(detail);
    detail.hidden = true;
  } else {
    includedModules.add(module.index);
    detail.hidden = false;
    setViewState(card, "preview");
    queueOriginalPreview(detail, module);
  }
  syncModuleCard(module.index);
  updateReplacementCounts();
  updateBatchControls();
}

moduleList.addEventListener("change", (event) => {
  const select = event.target.closest("[data-review-limit]");
  if (!select) return;
  const card = select.closest(".module-card");
  const index = Number(card?.dataset.index);
  const module = extraction?.modules.find((item) => item.index === index);
  if (!module?.reviewMeta?.hasImages) return;
  const nextLimit = Math.max(2, Math.min(module.reviewMeta.count, Number(select.value)));
  reviewLimits.set(index, nextLimit);
  const result = liquidResults.get(index);
  if (result?.code) liquidResults.set(index, { ...result, stale: true, staleReason: "review-limit" });
  syncModuleCard(index);
  updateBatchControls();
  showToast(`模块 ${index} 将生成 ${nextLimit} 条评论`);
});

moduleList.addEventListener("click", async (event) => {
  const previewWidthButton = event.target.closest("[data-preview-width]");
  if (previewWidthButton) {
    setPreviewWidth(previewWidthButton.closest(".module-detail"), Number(previewWidthButton.dataset.previewWidth));
    return;
  }
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const card = button.closest(".module-card");
  const module = extraction.modules.find((item) => item.index === Number(card.dataset.index));
  const action = button.dataset.action;

  if (action === "toggle-inclusion") return toggleModuleInclusion(card, module);
  if (action === "replace-images") return openImageReplacementDrawer(module);
  if (action === "preview" || action === "source" || action === "liquid-preview" || action === "liquid-code") return showModuleView(card, module, action);
  if (action === "generate-liquid" || action === "retry-liquid") return generateLiquid(module);
  if (action === "copy-liquid") {
    const code = liquidResults.get(module.index).code;
    if (new Blob([code]).size > SHOPIFY_CUSTOM_LIQUID_SAFE_BYTES) {
      showToast("代码超过 Shopify 50 KB 限制，请重新生成后再复制");
      return;
    }
    await copyText(code, `模块 ${module.index} 的 Custom Liquid 已复制`);
    showActionFeedback(button, "已复制 Liquid");
    return;
  }
  if (action === "download-liquid") {
    const result = liquidResults.get(module.index);
    downloadText(result.code, `${String(module.index).padStart(2, "0")}-${module.id || module.tag}-custom-liquid.liquid`.replace(/[^a-zA-Z0-9._-]/g, "-"));
    showActionFeedback(button, "已下载 Liquid");
    return;
  }
  if (action === "copy-original") {
    await copyText(cleanModuleHtml(module.html), `模块 ${module.index} 的原始 HTML 已复制`);
    showActionFeedback(button, "已复制 HTML");
    return;
  }
  if (action === "copy-document") {
    await copyText(standaloneDocument(module), `模块 ${module.index} 的原始文档已复制`);
    showActionFeedback(button, "已复制文档");
    return;
  }
  if (action === "download-original") {
    downloadOriginalModule(module);
    showActionFeedback(button, "已开始下载");
  }
});

imageReplacementList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-image-new-url]");
  if (!input) return;
  const row = input.closest("[data-image-index]");
  const item = activeImageItems[Number(row.dataset.imageIndex)];
  const value = input.value.trim();
  const thumb = row.querySelector(".image-thumb img");
  const previewLink = row.querySelector("[data-image-new-open]");
  const canPreview = value && validReplacementTarget(value);
  thumb.src = canPreview ? value : item.url;
  previewLink.href = canPreview ? value : "";
  previewLink.setAttribute("aria-disabled", String(!canPreview));
  previewLink.classList.toggle("is-disabled", !canPreview);
  updateImageReplacementActions();
});

imageReplacementList.addEventListener("click", (event) => {
  const disabledPreview = event.target.closest("[data-image-new-open][aria-disabled='true']");
  if (disabledPreview) event.preventDefault();
});

closeImageReplacementButton.addEventListener("click", () => imageReplacementDialog.close());

clearImageReplacementsButton.addEventListener("click", () => {
  imageReplacementList.querySelectorAll("[data-image-new-url]").forEach((input) => {
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
});

applyImageReplacementsButton.addEventListener("click", applyImageReplacementInputs);

replacementList.addEventListener("input", (event) => {
  const input = event.target.closest("[data-replacement-field]");
  if (!input) return;
  const rowElement = input.closest("[data-replacement-id]");
  const row = replacementRows.find((item) => item.id === rowElement.dataset.replacementId);
  if (!row) return;
  row[input.dataset.replacementField] = input.value;
  updateReplacementCounts();
  markLiquidResultsStale();
});

replacementList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-replacement]");
  if (!button) return;
  const id = button.closest("[data-replacement-id]").dataset.replacementId;
  const removed = replacementRows.find((row) => row.id === id);
  replacementRows = replacementRows.filter((row) => row.id !== id);
  renderReplacementRows();
  if (removed?.from) markLiquidResultsStale();
});

addReplacementButton.addEventListener("click", () => {
  replacementRows.push({ id: uniqueId(), from: "", to: "" });
  renderReplacementRows();
  replacementList.querySelector(".replacement-row:last-child input")?.focus();
});

filterInput.addEventListener("input", () => renderModules(filterInput.value));
generateSelectedButton.addEventListener("click", generateSelectedModules);
copySelectedLiquidButton.addEventListener("click", async () => {
  const bundle = selectedLiquidBundle();
  if (!bundle.complete) return;
  const overLimit = bundle.bytes > SHOPIFY_CUSTOM_LIQUID_SAFE_BYTES;
  if (overLimit) {
    liquidGroups.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    liquidGroupSizeSelect.focus({ preventScroll: true });
    showToast("完整代码已超过单个 Custom Liquid 容量，请按分组复制");
    return;
  }
  await copyText(
    bundle.code,
    `已复制 ${bundle.modules.length} 个 Liquid 模块${overLimit ? `，合计 ${formatByteSize(bundle.bytes)}，请粘贴到主题文件或拆分使用` : ""}`
  );
  showActionFeedback(copySelectedLiquidButton, "已复制全部 Liquid");
});
liquidGroupSizeSelect.addEventListener("change", () => {
  const bundle = selectedLiquidBundle();
  if (!bundle.complete) return;
  liquidGroupSize = Math.max(1, Math.min(bundle.modules.length, Number(liquidGroupSizeSelect.value)));
  resetLiquidGroups(bundle);
  renderLiquidGroups(bundle);
});
liquidGroupList.addEventListener("change", (event) => {
  const select = event.target.closest("[data-split-liquid-group]");
  if (!select || !select.value) return;
  const groupIndex = Number(select.dataset.splitLiquidGroup);
  const current = liquidGroupState.groups[groupIndex];
  if (!current?.length) return;
  const size = Math.max(1, Math.min(current.length - 1, Number(select.value)));
  const split = chunkModules(current, size);
  liquidGroupState.groups.splice(groupIndex, 1, ...split);
  renderLiquidGroups(selectedLiquidBundle());
});
liquidGroupList.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-copy-liquid-group]");
  if (!button || button.disabled) return;
  const bundle = selectedLiquidBundle();
  const moduleByIndex = new Map(bundle.modules.map((module) => [module.index, module]));
  const groupIndex = Number(button.dataset.copyLiquidGroup);
  const modules = (liquidGroupState.groups[groupIndex] || []).map((index) => moduleByIndex.get(index)).filter(Boolean);
  const code = liquidCodeForModules(modules);
  await copyText(code, `已复制第 ${groupIndex + 1} 组，共 ${modules.length} 个 Liquid 模块`);
  showActionFeedback(button, `已复制第 ${groupIndex + 1} 组`);
});
cancelGenerationButton.addEventListener("click", () => batchController?.abort());
openModelSettingsButton.addEventListener("click", openModelSettings);
closeModelSettingsButton.addEventListener("click", () => modelSettingsDialog.close());
modelSettingsDialog.addEventListener("click", (event) => {
  if (event.target === modelSettingsDialog) modelSettingsDialog.close();
});
toggleApiKeyButton.addEventListener("click", () => {
  const reveal = apiKeyInput.type === "password";
  apiKeyInput.type = reveal ? "text" : "password";
  toggleApiKeyButton.textContent = reveal ? "隐藏" : "显示";
  toggleApiKeyButton.setAttribute("aria-pressed", String(reveal));
  toggleApiKeyButton.setAttribute("aria-label", reveal ? "隐藏 API Key" : "显示 API Key");
});

aiProviderInput.addEventListener("change", () => {
  const provider = aiProviderInput.value;
  const changedProvider = provider !== loadedModelSettings?.provider;
  if (changedProvider) {
    apiBaseUrlInput.value = provider === "deepseek" ? "https://api.deepseek.com" : "";
    aiModelInput.value = provider === "deepseek" ? "deepseek-chat" : "";
    apiKeyInput.value = "";
    apiKeyInput.placeholder = provider === "newapi" ? "输入 New API 平台 Token" : "输入新的 API Key";
    apiKeyHelp.textContent = `切换到 ${providerName(provider)} 后，需要输入对应服务的 API Key。`;
    aiThinkingInput.value = "disabled";
  }
  updateProviderFields(provider);
  setModelSettingsStatus(`请填写 ${providerName(provider)} 的地址、API Key 和模型`, "checking");
});

testModelSettingsButton.addEventListener("click", async () => {
  if (!apiBaseUrlInput.reportValidity()) return;
  setModelSettingsBusy(true);
  setModelSettingsStatus("正在测试 API 和模型连接", "checking");
  try {
    const response = await fetch("/api/ai/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modelSettingsPayload())
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "连接测试失败");
    renderModelSuggestions(data.models || []);
    const selectedModel = aiModelInput.value.trim();
    const selectedAvailable = data.models?.length && selectedModel ? data.models.includes(selectedModel) : data.modelAvailable;
    const state = data.models?.length && !selectedModel ? "success" : selectedAvailable === false ? "checking" : "success";
    const message = data.models?.length && !selectedModel
      ? `连接成功，已读取 ${data.models.length} 个模型，请从下拉框选择`
      : selectedAvailable === false
      ? `API 连接成功，但模型列表中没有 ${selectedModel}`
      : (data.models?.length ? `连接成功，已读取 ${data.models.length} 个可用模型` : data.message);
    setModelSettingsStatus(message, state);
  } catch (error) {
    setModelSettingsStatus(error.message, "error");
  } finally {
    setModelSettingsBusy(false);
  }
});

modelResultsSelect.addEventListener("change", () => {
  if (!modelResultsSelect.value) return;
  aiModelInput.value = modelResultsSelect.value;
  setModelSettingsStatus(`已选择模型 ${modelResultsSelect.value}，点击“保存配置”后生效`, "success");
});

aiModelInput.addEventListener("input", () => {
  const hasOption = Array.from(modelResultsSelect.options).some((option) => option.value === aiModelInput.value.trim());
  modelResultsSelect.value = hasOption ? aiModelInput.value.trim() : "";
});

modelSettingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!modelSettingsForm.reportValidity()) return;
  setModelSettingsBusy(true);
  setModelSettingsStatus("正在保存配置", "checking");
  try {
    const response = await fetch("/api/ai/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(modelSettingsPayload())
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "保存失败");
    populateModelSettings(data);
    setModelSettingsStatus(`已保存，下一次生成将使用 ${data.model}`, "success");
    await loadAiStatus();
    showToast(`模型已切换为 ${data.model}`);
  } catch (error) {
    setModelSettingsStatus(error.message, "error");
  } finally {
    setModelSettingsBusy(false);
  }
});

restoreEnvSettingsButton.addEventListener("click", async () => {
  setModelSettingsBusy(true);
  setModelSettingsStatus("正在恢复 .env 配置", "checking");
  try {
    const response = await fetch("/api/ai/config", { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "恢复失败");
    populateModelSettings(data);
    setModelSettingsStatus("已恢复 .env 配置", "success");
    await loadAiStatus();
    showToast("已恢复 .env 模型配置");
  } catch (error) {
    setModelSettingsStatus(error.message, "error");
  } finally {
    setModelSettingsBusy(false);
  }
});

document.querySelector("#copy-all").addEventListener("click", () => {
  const text = extraction.modules.map((module) => `<!-- Module ${module.index}: ${module.id || module.tag} -->\n${cleanModuleHtml(module.html)}`).join("\n\n");
  copyText(text, `已复制 ${extraction.count} 个原始模块`);
});

async function loadAiStatus() {
  aiStatusLabel.dataset.state = "checking";
  aiStatusLabel.textContent = "正在检查模型配置";
  try {
    const response = await fetch("/api/ai/status");
    const data = await response.json();
    aiConfig = { ...data, checking: false };
    if (data.configured) {
      aiStatusLabel.dataset.state = "ready";
      aiStatusLabel.textContent = data.mock ? "模拟模式" : `${providerName(data.provider)} · ${data.model} 已就绪`;
      aiHelp.textContent = data.mock
        ? "当前为本地流程验证模式，不会调用外部模型或产生费用。"
        : `${data.source === "manual" ? "手动配置" : ".env 配置"}，当前使用 ${providerName(data.provider)}。先排除不需要的模块，再生成 Custom Liquid。`;
    } else {
      aiStatusLabel.dataset.state = "warning";
      aiStatusLabel.textContent = "尚未配置 API Key";
      aiHelp.textContent = "点击右上角“模型配置”，填写 API 地址、密钥和模型 ID。";
    }
  } catch {
    aiConfig = { configured: false, provider: "deepseek", model: "deepseek-v4-flash", checking: false, mock: false };
    aiStatusLabel.dataset.state = "error";
    aiStatusLabel.textContent = "无法检查模型配置";
    aiHelp.textContent = "无法读取服务端 AI 状态，请确认本地服务已经启动后重试。";
  }
  updateBatchControls();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  results.hidden = true;
  statusPanel.hidden = false;
  statusPanel.className = "status-panel loading";
  statusPanel.innerHTML = '<div class="skeleton-lines"><span></span><span></span><span></span></div><h2>正在渲染并识别模块</h2><p>正在等待产品页完成首屏加载，请不要关闭页面。</p>';
  submitButton.disabled = true;
  submitButton.textContent = "提取中";

  try {
    const response = await fetch("/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: urlInput.value })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "提取失败");
    extraction = data;
    includedModules.clear();
    data.modules.forEach((module) => includedModules.add(module.index));
    liquidResults.clear();
    imageReplacements.clear();
    liquidGroupSize = 5;
    liquidGroupState = { signature: "", groups: [] };
    reviewLimits.clear();
    data.modules.forEach((module) => {
      if (module.reviewMeta?.hasImages && module.reviewMeta.count >= 2) {
        reviewLimits.set(module.index, Math.min(3, module.reviewMeta.count));
      }
    });
    replacementCorpusCache.clear();
    replacementRows = [{ id: uniqueId(), from: "", to: "" }];
    batchProgress.hidden = true;
    batchProgressBar.style.width = "0%";
    batchProgressTrack.setAttribute("aria-valuenow", "0");
    statusPanel.hidden = true;
    results.hidden = false;
    const source = new URL(data.url);
    const sourceLink = document.querySelector("#source-domain");
    sourceLink.textContent = `${source.hostname} · 打开来源页`;
    sourceLink.href = data.url;
    document.querySelector("#result-title").textContent = data.title || "提取结果";
    document.querySelector("#result-meta").textContent = `${data.count} 个模块 · ${data.totalSize} · 来源视口 ${data.viewport?.width || 1440}px · ${data.boundary} · ${(data.elapsedMs / 1000).toFixed(1)} 秒`;
    filterInput.value = "";
    renderReplacementRows();
    renderModules();
    await loadAiStatus();
  } catch (error) {
    statusPanel.className = "status-panel error";
    statusPanel.innerHTML = `<div class="error-code">无法提取</div><h2>${escapeHtml(error.message)}</h2><p>请确认链接可以在无登录状态下打开，然后重试。</p>`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "开始提取";
  }
});

renderReplacementRows();
loadAiStatus();
