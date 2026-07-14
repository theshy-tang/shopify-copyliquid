import "dotenv/config";
import dns from "node:dns/promises";
import net from "node:net";
import path from "node:path";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import express from "express";
import { chromium } from "playwright-core";
import { aiSettingsEnvironment, normalizeAiSettings, publicAiSettings } from "./lib/ai-settings.js";
import { ConversionError, convertModuleToCustomLiquid, extractReviewInventory, getDeepSeekConfig } from "./lib/custom-liquid.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const port = Number(process.env.PORT || 4173);
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const sourceViewport = { width: 1440, height: 1000 };
const extractionSessions = new Map();
const extractionTtlMs = 30 * 60 * 1000;
const maxExtractionSessions = 20;
const maxCapturedCssBytes = 1_500_000;
const maxSingleStylesheetBytes = 500_000;
const aiConfigPath = path.join(__dirname, ".ai-config.json");

function loadManualAiSettings() {
  try {
    const saved = JSON.parse(readFileSync(aiConfigPath, "utf8"));
    return normalizeAiSettings(saved);
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn(`Ignoring invalid .ai-config.json: ${error.message}`);
    return null;
  }
}

let manualAiSettings = loadManualAiSettings();

function effectiveAiEnvironment(settings = manualAiSettings) {
  return settings ? aiSettingsEnvironment(settings) : process.env;
}

function effectiveAiConfig(settings = manualAiSettings) {
  return getDeepSeekConfig(effectiveAiEnvironment(settings));
}

function saveManualAiSettings(settings) {
  writeFileSync(aiConfigPath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  manualAiSettings = settings;
}

function settingsFromRequest(body) {
  return normalizeAiSettings(body, effectiveAiConfig());
}

app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(__dirname, "public")));

function pruneExtractionSessions() {
  const now = Date.now();
  for (const [id, session] of extractionSessions) {
    if (now - session.createdAt > extractionTtlMs) extractionSessions.delete(id);
  }
  while (extractionSessions.size > maxExtractionSessions) {
    extractionSessions.delete(extractionSessions.keys().next().value);
  }
}

setInterval(pruneExtractionSessions, 5 * 60 * 1000).unref();

function isPrivateAddress(address) {
  if (net.isIPv4(address)) {
    const [a, b] = address.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  const value = address.toLowerCase();
  return value === "::1" || value === "::" || value.startsWith("fc") ||
    value.startsWith("fd") || value.startsWith("fe80:");
}

async function validatePublicUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("请输入完整链接，例如 https://store.com/products/item");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("只支持 http 或 https 链接");
  }
  if (url.username || url.password) throw new Error("链接中不能包含账号或密码");
  const records = await dns.lookup(url.hostname, { all: true });
  if (!records.length || records.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("不能访问本机或局域网地址");
  }
  return url.href;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

app.post("/api/extract", async (req, res) => {
  const startedAt = Date.now();
  let browser;
  try {
    const targetUrl = await validatePublicUrl(String(req.body?.url || "").trim());
    browser = await chromium.launch({ executablePath: chromePath, headless: true });
    const context = await browser.newContext({
      viewport: sourceViewport,
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36"
    });
    const page = await context.newPage();
    const capturedStyles = [];
    const stylesheetTasks = [];
    let capturedCssBytes = 0;
    page.on("response", (response) => {
      if (response.request().resourceType() !== "stylesheet" || !response.ok()) return;
      const task = (async () => {
        try {
          const css = await response.text();
          const bytes = Buffer.byteLength(css, "utf8");
          if (!css || bytes > maxSingleStylesheetBytes || capturedCssBytes + bytes > maxCapturedCssBytes) return;
          capturedCssBytes += bytes;
          capturedStyles.push({ url: response.url(), css });
        } catch {}
      })();
      stylesheetTasks.push(task);
    });
    await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(1800);

    // Trigger native and theme-managed lazy loading without allowing an endless page
    // to make extraction unbounded. Return to the top before measuring modules.
    await page.evaluate(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const pageHeight = Math.min(document.documentElement.scrollHeight, 40000);
      const step = Math.max(600, Math.floor(window.innerHeight * 0.8));
      for (let top = 0; top < pageHeight; top += step) {
        window.scrollTo(0, top);
        await wait(70);
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);

    for (let pass = 0; pass < 3; pass += 1) {
      const taskCount = stylesheetTasks.length;
      await Promise.allSettled(stylesheetTasks.slice());
      if (stylesheetTasks.length === taskCount) break;
    }

    const capturedCss = capturedStyles.map(({ url, css }) =>
      `/* Captured stylesheet: ${url.replace(/\*\//g, "")} */\n${css.replace(/^\s*@charset[^;]+;/i, "")}`
    ).join("\n");
    if (capturedCss) {
      const injected = await page.addStyleTag({ content: capturedCss }).catch(() => null);
      await injected?.evaluate((node) => node.setAttribute("data-module-copier-captured-css", "true")).catch(() => {});
    }

    const finalUrl = page.url();
    await validatePublicUrl(finalUrl);

    const result = await page.evaluate(async () => {
      const main = document.querySelector("main#MainContent") || document.querySelector("#MainContent");
      if (!main) return { error: "页面中没有找到 #MainContent" };

      const attributesToObject = (element) => Object.fromEntries(
        Array.from(element.attributes, (attribute) => [attribute.name, attribute.value])
      );

      const directElements = Array.from(main.children);
      let candidates = directElements.filter((node) => ["SECTION", "DIV"].includes(node.tagName));
      let boundary = "#MainContent 的一级 section/div";

      if (candidates.length === 1 && !candidates[0].matches(".shopify-section, [id^='shopify-section']")) {
        const nested = Array.from(candidates[0].children).filter((node) =>
          ["SECTION", "DIV"].includes(node.tagName) && node.matches(".shopify-section, [id^='shopify-section']")
        );
        if (nested.length > 1) {
          candidates = nested;
          boundary = "#MainContent 单层容器内的 Shopify 模块";
        }
      }

      const absolutize = (element) => {
        const clone = element.cloneNode(true);
        const sourceNodes = [element, ...element.querySelectorAll("*")];
        const cloneNodes = [clone, ...clone.querySelectorAll("*")];
        const attrs = ["src", "href", "poster", "data-src", "data-bgset"];
        cloneNodes.forEach((node, index) => {
          const sourceNode = sourceNodes[index];
          const className = sourceNode?.getAttribute?.("class") || "";
          const isAnimationNode = sourceNode && (
            /scroll-trigger|reveal|animate|fade|slide-in|slide-up|slide-down/i.test(className) ||
            sourceNode.matches("[data-aos], [data-animate], [data-animation], [style*='opacity'], [style*='visibility'], [style*='transform']")
          );
          if (isAnimationNode) {
            const computed = getComputedStyle(sourceNode);
            node.setAttribute("data-static-opacity", computed.opacity);
            node.setAttribute("data-static-visibility", computed.visibility);
            node.setAttribute("data-static-transform", computed.transform);
            node.setAttribute("data-static-clip-path", computed.clipPath);
          }
          attrs.forEach((attr) => {
            const value = node.getAttribute(attr);
            if (!value || value.startsWith("data:") || value.startsWith("#")) return;
            try { node.setAttribute(attr, new URL(value, document.baseURI).href); } catch {}
          });
          ["srcset", "data-srcset"].forEach((attr) => {
            const value = node.getAttribute(attr);
            if (!value) return;
            const rewritten = value.split(",").map((part) => {
              const bits = part.trim().split(/\s+/);
              try { bits[0] = new URL(bits[0], document.baseURI).href; } catch {}
              return bits.join(" ");
            }).join(", ");
            node.setAttribute(attr, rewritten);
          });
          const inlineStyle = node.getAttribute("style");
          if (inlineStyle?.includes("url(")) {
            node.setAttribute("style", inlineStyle.replace(/url\((['"]?)(.*?)\1\)/gi, (match, quote, value) => {
              if (!value || value.startsWith("data:") || value.startsWith("#")) return match;
              try { return `url(${quote}${new URL(value, document.baseURI).href}${quote})`; } catch { return match; }
            }));
          }
        });
        return clone.outerHTML;
      };

      const statePseudoPattern = /:(?:hover|active|focus-visible|focus-within|focus|visited|checked|disabled|enabled|open)\b/gi;
      const pseudoElementPattern = /::(?:before|after|marker|placeholder|selection|backdrop|file-selector-button)\b/gi;
      const selectorMatchesModule = (element, selectorText) => {
        const selector = String(selectorText || "")
          .replace(pseudoElementPattern, "")
          .replace(statePseudoPattern, "")
          .trim();
        if (!selector) return false;
        try {
          return element.matches(selector) || Boolean(element.querySelector(selector));
        } catch {
          const tokens = new Set([
            ...(element.id ? [`#${CSS.escape(element.id)}`] : []),
            ...Array.from(element.classList, (className) => `.${CSS.escape(className)}`),
            ...Array.from(element.querySelectorAll("[id]"), (node) => `#${CSS.escape(node.id)}`),
            ...Array.from(element.querySelectorAll("[class]"), (node) => Array.from(node.classList, (className) => `.${CSS.escape(className)}`)).flat()
          ]);
          return Array.from(tokens).some((token) => selectorText.includes(token));
        }
      };

      const collectCssForElement = (element) => {
        const animationNames = new Set();
        const fontFamilies = new Set();
        [element, ...element.querySelectorAll("*")].slice(0, 1200).forEach((node) => {
          const computed = getComputedStyle(node);
          const names = computed.animationName.split(",").map((name) => name.trim()).filter((name) => name && name !== "none");
          names.forEach((name) => animationNames.add(name));
          computed.fontFamily.split(",").map((name) => name.trim().replace(/^['"]|['"]$/g, "").toLowerCase()).filter(Boolean).forEach((name) => fontFamilies.add(name));
        });
        const seen = new Set();
        const chunks = [];
        let length = 0;
        const append = (cssText) => {
          if (!cssText || seen.has(cssText) || length + cssText.length > 420000) return;
          seen.add(cssText);
          chunks.push(cssText);
          length += cssText.length;
        };
        const walkRules = (rules) => {
          const matches = [];
          for (const rule of Array.from(rules || [])) {
            if (rule.type === CSSRule.STYLE_RULE) {
              const isGlobalVariableRule = /(^|,)\s*(?::root|html|body)(?:\s|,|$)/i.test(rule.selectorText) && rule.style.cssText.includes("--");
              if (isGlobalVariableRule || selectorMatchesModule(element, rule.selectorText)) {
                matches.push(rule.cssText);
              }
              continue;
            }
            if (rule.type === CSSRule.FONT_FACE_RULE) {
              const family = String(rule.style.getPropertyValue("font-family") || "").trim().replace(/^['"]|['"]$/g, "").toLowerCase();
              if (fontFamilies.has(family)) matches.push(rule.cssText);
              continue;
            }
            if (rule.type === CSSRule.KEYFRAMES_RULE) {
              if (animationNames.has(rule.name)) {
                matches.push(rule.cssText);
              }
              continue;
            }
            if (rule.cssRules) {
              const nested = walkRules(rule.cssRules);
              if (nested.length) {
                const header = rule.cssText.slice(0, rule.cssText.indexOf("{")).trim();
                const wrapped = `${header}{${nested.join("\n")}}`;
                matches.push(wrapped);
              }
            }
          }
          return matches;
        };
        Array.from(document.styleSheets).forEach((sheet) => {
          try { walkRules(sheet.cssRules).forEach(append); } catch {}
        });
        return chunks.join("\n");
      };

      const modules = [];
      for (let index = 0; index < candidates.length; index += 1) {
        const element = candidates[index];
        element.scrollIntoView({ behavior: "instant", block: "center" });
        await new Promise((resolve) => setTimeout(resolve, 850));
        const html = absolutize(element);
        const css = collectCssForElement(element);
        const rect = element.getBoundingClientRect();
        const heading = element.querySelector("h1, h2, h3, [class*='title'], [class*='heading']")?.textContent
          ?.replace(/\s+/g, " ").trim().slice(0, 90) || "";
        const id = element.id || "";
        const classes = Array.from(element.classList);
        modules.push({
          index: index + 1,
          tag: element.tagName.toLowerCase(),
          id,
          classes,
          heading,
          html,
          css,
          size: new Blob([html]).size,
          shopifySection: element.matches(".shopify-section, [id^='shopify-section']"),
          originalSize: { width: Math.round(rect.width), height: Math.round(rect.height) }
        });
      }

      const stylesheetLinks = Array.from(document.querySelectorAll("link[rel='stylesheet'][href]"), (node) => {
        const clone = node.cloneNode(false);
        clone.setAttribute("href", node.href);
        return clone.outerHTML;
      });

      const rootComputedStyle = getComputedStyle(document.documentElement);
      const bodyComputedStyle = getComputedStyle(document.body);

      return {
        title: document.title,
        boundary,
        modules,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        previewEnvironment: {
          rootFontSize: rootComputedStyle.fontSize,
          bodyFontSize: bodyComputedStyle.fontSize,
          bodyLineHeight: bodyComputedStyle.lineHeight
        },
        rootAttributes: attributesToObject(document.documentElement),
        bodyAttributes: attributesToObject(document.body),
        stylesheetLinks,
        stylesheets: Array.from(document.querySelectorAll("link[rel='stylesheet'][href]"), (node) => node.href),
        styleTags: Array.from(document.querySelectorAll("head style:not([data-module-copier-captured-css])"), (node) => node.outerHTML),
        themeColor: document.querySelector("meta[name='theme-color']")?.content || ""
      };
    });

    if (result.error) return res.status(422).json({ error: result.error });
    const totalBytes = result.modules.reduce((sum, item) => sum + item.size, 0);
    const extractionId = randomUUID();
    extractionSessions.set(extractionId, {
      createdAt: Date.now(),
      url: finalUrl,
      modules: result.modules
    });
    pruneExtractionSessions();
    const publicModules = result.modules.map(({ css: _css, ...module }) => {
      const reviewInventory = extractReviewInventory(module.html);
      return {
        ...module,
        ...(reviewInventory ? {
          reviewMeta: {
            count: reviewInventory.count,
            hasImages: reviewInventory.hasImages,
            imageItemCount: reviewInventory.imageItemCount
          }
        } : {})
      };
    });
    res.json({
      ...result,
      modules: publicModules,
      extractionId,
      url: finalUrl,
      count: result.modules.length,
      totalSize: formatBytes(totalBytes),
      elapsedMs: Date.now() - startedAt
    });
  } catch (error) {
    const message = error?.name === "TimeoutError" ? "页面加载超时，请确认链接可以公开访问" : error.message;
    res.status(400).json({ error: message || "提取失败" });
  } finally {
    await browser?.close().catch(() => {});
  }
});

app.get("/api/ai/status", (_req, res) => {
  const config = effectiveAiConfig();
  res.json({
    configured: config.configured,
    provider: config.provider,
    model: config.mock ? "mock" : config.model,
    thinking: config.thinking,
    mock: config.mock,
    source: manualAiSettings ? "manual" : "environment"
  });
});

app.get("/api/ai/config", (_req, res) => {
  res.json(publicAiSettings(effectiveAiConfig(), manualAiSettings ? "manual" : "environment"));
});

app.put("/api/ai/config", (req, res) => {
  try {
    const settings = settingsFromRequest(req.body);
    saveManualAiSettings(settings);
    res.json({ ok: true, ...publicAiSettings(effectiveAiConfig(), "manual") });
  } catch (error) {
    res.status(400).json({ error: error.message || "模型配置无效", code: "AI_CONFIG_INVALID" });
  }
});

app.delete("/api/ai/config", (_req, res) => {
  manualAiSettings = null;
  rmSync(aiConfigPath, { force: true });
  res.json({ ok: true, ...publicAiSettings(effectiveAiConfig(), "environment") });
});

app.post("/api/ai/test", async (req, res) => {
  let timer;
  try {
    const settings = settingsFromRequest(req.body);
    if (!settings.apiKey) throw new Error("请填写 API Key");
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), Math.min(settings.timeoutMs, 20_000));
    const response = await fetch(`${settings.baseUrl}/models`, {
      headers: { Authorization: `Bearer ${settings.apiKey}` },
      signal: controller.signal
    });
    const responseText = await response.text();
    if (!response.ok) {
      const message = response.status === 401 ? "API Key 无效" : `服务返回 HTTP ${response.status}`;
      throw new Error(message);
    }
    let modelIds = [];
    try {
      const payload = JSON.parse(responseText);
      modelIds = Array.isArray(payload?.data) ? payload.data.map((item) => String(item?.id || "")).filter(Boolean) : [];
    } catch {}
    res.json({
      ok: true,
      message: modelIds.includes(settings.model)
        ? `连接成功，已找到模型 ${settings.model}`
        : (modelIds.length ? `连接成功，但模型列表中没有 ${settings.model}` : "连接成功，模型列表接口可用"),
      modelAvailable: modelIds.length ? modelIds.includes(settings.model) : null,
      models: modelIds.slice(0, 100)
    });
  } catch (error) {
    const message = error?.name === "AbortError" ? "连接测试超时" : error.message;
    res.status(400).json({ error: message || "连接测试失败", code: "AI_CONNECTION_FAILED" });
  } finally {
    clearTimeout(timer);
  }
});

app.post("/api/convert", async (req, res) => {
  const requestController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) requestController.abort();
  });
  try {
    pruneExtractionSessions();
    const extractionId = String(req.body?.extractionId || "").trim();
    const moduleIndex = Number(req.body?.moduleIndex);
    const session = extractionSessions.get(extractionId);
    if (!session) {
      throw new ConversionError("提取结果已经过期，请重新提取产品页面", {
        code: "EXTRACTION_EXPIRED",
        status: 410,
        retryable: false
      });
    }
    const module = session.modules.find((item) => item.index === moduleIndex);
    if (!module) {
      throw new ConversionError("没有找到要转换的模块，请重新提取页面", {
        code: "MODULE_NOT_FOUND",
        status: 404,
        retryable: false
      });
    }
    const namespace = `ai-liquid-${extractionId.replace(/-/g, "").slice(0, 10)}-${module.index}`;
    const result = await convertModuleToCustomLiquid({
      module,
      css: module.css,
      sourceUrl: session.url,
      replacements: req.body?.replacements,
      reviewLimit: req.body?.reviewLimit,
      namespace,
      env: effectiveAiEnvironment(),
      signal: requestController.signal
    });
    res.json({
      ok: true,
      moduleIndex: module.index,
      namespace,
      ...result
    });
  } catch (error) {
    const status = error instanceof ConversionError ? error.status : 500;
    res.status(status).json({
      error: error?.message || "Custom Liquid 生成失败",
      code: error?.code || "CONVERSION_FAILED",
      retryable: Boolean(error?.retryable)
    });
  }
});

app.get("/api/health", (_req, res) => {
  const ai = effectiveAiConfig();
  res.json({
    ok: true,
    aiConfigured: ai.configured,
    aiProvider: ai.provider,
    aiModel: ai.mock ? "mock" : ai.model,
    deepseekConfigured: ai.configured,
    deepseekModel: ai.mock ? "mock" : ai.model
  });
});

app.listen(port, () => {
  console.log(`Shopify module copier: http://localhost:${port}`);
});
