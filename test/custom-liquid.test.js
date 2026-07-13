import test from "node:test";
import assert from "node:assert/strict";
import {
  ConversionError,
  applyTextReplacements,
  auditReviewCustomLiquid,
  compactCustomLiquidCode,
  convertModuleToCustomLiquid,
  extractReviewInventory,
  getDeepSeekConfig,
  limitImageReviewSource,
  optimizeReviewSourceForAi,
  parseDeepSeekResult,
  validateCustomLiquid
} from "../lib/custom-liquid.js";

const moduleFixture = {
  index: 3,
  tag: "section",
  id: "reference-module",
  heading: "Original Product",
  html: '<section><h2>Original Product</h2><img alt="Original Product"><script>const label = "Original Product";</script></section>'
};

const reviewItems = [
  "The first review explains a clear improvement after several weeks. Alice A. Verified Buyer",
  "The second review says the patches stayed secure during travel. Brian B. Verified Buyer",
  "The third review reports smoother and healthier looking nails. Carla C. Verified Buyer"
];

const reviewModuleFixture = {
  index: 10,
  tag: "section",
  id: "testimonials",
  heading: "Real results from real users",
  html: `<section class="testimonials"><div class="splide__list">${reviewItems.map((item) => `<article class="testimonial-card splide__slide"><p>${item}</p></article>`).join("")}</div></section>`
};

const imageReviewModuleFixture = {
  ...reviewModuleFixture,
  html: `<section class="testimonials"><div class="splide__list">${reviewItems.map((item, index) => `<article class="testimonial-card splide__slide"><img src="https://cdn.example/review-${index + 1}.jpg" alt=""><p>${item}</p></article>`).join("")}</div></section>`
};

function reviewLiquidCode(items = reviewItems) {
  return `<section id="ai-liquid-review-10">
  <button type="button" aria-label="Previous review">&lt;</button>
  <div class="track">${items.map((item) => `<article class="card"><p>${item}</p></article>`).join("")}</div>
  <button type="button" aria-label="Next review">&gt;</button>
</section>
<style>
#ai-liquid-review-10 .track{display:flex;overflow:hidden}
#ai-liquid-review-10 .card{flex:0 0 100%}
</style>
<script>(()=>{const root=document.getElementById('ai-liquid-review-10');const track=root.querySelector('.track');const cards=root.querySelectorAll('.card');let index=0;const show=()=>{track.style.transform='translateX(-'+(index*100)+'%)'};root.querySelector('[aria-label="Previous review"]').addEventListener('click',()=>{index=(index-1+cards.length)%cards.length;show()});root.querySelector('[aria-label="Next review"]').addEventListener('click',()=>{index=(index+1)%cards.length;show()})})();</script>`;
}

test("DeepSeek configuration uses the current v4 model by default", () => {
  const config = getDeepSeekConfig({ DEEPSEEK_API_KEY: "test-key" });
  assert.equal(config.model, "deepseek-v4-flash");
  assert.equal(config.configured, true);
  assert.equal(config.thinking, "disabled");
  assert.equal(getDeepSeekConfig({ DEEPSEEK_API_KEY: "test-key", DEEPSEEK_MODEL: "gateway/fast-model-v2" }).model, "gateway/fast-model-v2");
});

test("global replacements change visible text and content attributes but not scripts", () => {
  const result = applyTextReplacements(moduleFixture.html, [{ from: "Original Product", to: "New Product" }]);
  assert.match(result.html, /<h2>New Product<\/h2>/);
  assert.match(result.html, /alt="New Product"/);
  assert.match(result.html, /const label = "Original Product"/);
  assert.equal(result.counts[0].count, 2);
});

test("review inventory finds every unique testimonial card", () => {
  const inventory = extractReviewInventory(reviewModuleFixture.html);
  assert.equal(inventory.count, 3);
  assert.equal(inventory.items[2].text, reviewItems[2]);
  assert.equal(inventory.hasImages, false);
});

test("image review source can be limited before it is sent to the model", () => {
  const inventory = extractReviewInventory(imageReviewModuleFixture.html);
  assert.equal(inventory.hasImages, true);
  assert.equal(inventory.imageItemCount, 3);

  const limited = limitImageReviewSource(imageReviewModuleFixture.html, inventory, 2);
  assert.equal(limited.applied, true);
  assert.equal(limited.availableCount, 3);
  assert.equal(limited.inventory.count, 2);
  assert.match(limited.html, /review-1\.jpg/);
  assert.match(limited.html, /review-2\.jpg/);
  assert.doesNotMatch(limited.html, /review-3\.jpg/);

  const textOnlyInventory = extractReviewInventory(reviewModuleFixture.html);
  const unchanged = limitImageReviewSource(reviewModuleFixture.html, textOnlyInventory, 2);
  assert.equal(unchanged.applied, false);
  assert.equal(unchanged.inventory.count, 3);
});

test("review source optimization removes repeated star SVG paths without losing review text", () => {
  const star = '<svg class="rating-star" viewBox="0 0 10 10"><path d="M0 0 L10 10"></path></svg>';
  const source = `<section><!-- slide --><script>startThemeCarousel()</script><article class="testimonial-card rating-layout"><div class="stars">${star.repeat(5)}</div><p>${reviewItems[0]}</p><div class="author">Alice A. Verified Buyer</div></article></section>`;
  const optimized = optimizeReviewSourceForAi(source);
  assert.doesNotMatch(optimized, /<svg|<script|<!--/i);
  assert.match(optimized, /★★★★★/);
  assert.match(optimized, /color:#f5c518/);
  assert.match(optimized, /The first review explains a clear improvement/);
  assert.match(optimized, /Alice A\. Verified Buyer/);
  assert.ok(Buffer.byteLength(optimized, "utf8") < Buffer.byteLength(source, "utf8") / 2);
});

test("review audit rejects omissions and accepts a complete native carousel", () => {
  const inventory = extractReviewInventory(reviewModuleFixture.html);
  const incomplete = auditReviewCustomLiquid(reviewLiquidCode(reviewItems.slice(0, 2)).replace(/<script>[\s\S]*?<\/script>/, ""), inventory);
  assert.equal(incomplete.ok, false);
  assert.equal(incomplete.outputCount, 2);
  assert.match(incomplete.issues.join(" "), /2\/3/);

  const complete = auditReviewCustomLiquid(reviewLiquidCode(), inventory);
  assert.equal(complete.ok, true);
  assert.equal(complete.outputCount, 3);
  assert.equal(complete.checks.hasAutoplay, false);
  assert.equal(complete.checks.hasSwipe, false);

  const unnecessaryAutoplay = auditReviewCustomLiquid(reviewLiquidCode().replace("</script>", "setInterval(()=>{},4000);</script>"), inventory);
  assert.equal(unnecessaryAutoplay.ok, false);
  assert.match(unnecessaryAutoplay.issues.join(" "), /不需要的自动轮播/);
});

test("review audit tolerates tag boundaries and apostrophe typography without losing completeness", () => {
  const sourceItems = [
    ["Noticeable improvement in just weeks", "I’ve tried creams for a long time.", "Anna A. Verified Buyer"],
    ["Much easier than creams", "It’s simple to use every night.", "Brian B. Verified Buyer"],
    ["Finally something that works", "I’m happy with the gradual result.", "Carla C. Verified Buyer"]
  ];
  const source = `<section class="testimonials">${sourceItems.map(([title, body, author]) => `<article class="testimonial-card"><h3>${title}</h3><p>${body}</p><div class="author">${author}</div></article>`).join("")}</section>`;
  const inventory = extractReviewInventory(source);
  const outputItems = sourceItems.map(([title, body, author]) => `<article class="card"><strong>${title}</strong> <span>${body.replace(/[’]/g, "'")}</span><footer>${author}</footer></article>`).join("");
  const code = reviewLiquidCode().replace(/<div class="track">[\s\S]*?<\/div>\s*<button type="button" aria-label="Next review">/, `<div class="track">${outputItems}</div><button type="button" aria-label="Next review">`);
  const audit = auditReviewCustomLiquid(code, inventory);
  assert.equal(audit.outputCount, 3);
  assert.equal(audit.ok, true);
});

test("incomplete AI review output is automatically repaired and re-audited", async () => {
  const requests = [];
  const providerResponse = (code, usage) => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ code, summary: "已生成评论轮播", warnings: [] }) }, finish_reason: "stop" }],
    usage,
    model: "deepseek-v4-flash"
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    if (requests.length === 1) return providerResponse('<section id="ai-liquid-review-10"><p>The first review explains a clear improvement after several weeks. Alice A. Verified Buyer</p></section>', { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 });
    return providerResponse(reviewLiquidCode(), { prompt_tokens: 40, completion_tokens: 30, total_tokens: 70 });
  };

  const result = await convertModuleToCustomLiquid({
    module: reviewModuleFixture,
    css: ".testimonial-card { color: #222; }",
    sourceUrl: "https://store.example/products/item",
    replacements: [],
    namespace: "ai-liquid-review-10",
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetchImpl
  });

  assert.equal(requests.length, 2);
  assert.match(requests[0].messages[1].content, /exactly 3 unique review/);
  assert.match(requests[0].messages[1].content, /Do not add autoplay/);
  assert.match(requests[1].messages[0].content, /repair an existing Shopify Custom Liquid review carousel/);
  assert.equal(result.reviewAudit.repaired, true);
  assert.equal(result.reviewAudit.outputCount, 3);
  assert.equal(result.usage.total_tokens, 190);
});

test("conversion audits only the selected number of image reviews", async () => {
  const requests = [];
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ code: reviewLiquidCode(reviewItems.slice(0, 2)), summary: "已生成 2 条评论", warnings: [] }) }, finish_reason: "stop" }],
      usage: { total_tokens: 80 },
      model: "deepseek-v4-flash"
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };

  const result = await convertModuleToCustomLiquid({
    module: imageReviewModuleFixture,
    css: ".testimonial-card { color: #222; }",
    sourceUrl: "https://store.example/products/item",
    replacements: [],
    reviewLimit: 2,
    namespace: "ai-liquid-review-10",
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetchImpl
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[1].content, /exactly 2 unique review/);
  assert.doesNotMatch(requests[0].messages[1].content, /The third review reports/);
  assert.equal(result.requestAudit.reviewLimitApplied, true);
  assert.equal(result.requestAudit.availableReviewCount, 3);
  assert.equal(result.reviewAudit.sourceCount, 2);
  assert.equal(result.reviewAudit.outputCount, 2);
  assert.equal(result.reviewAudit.availableCount, 3);
});

test("mock conversion returns validated scoped Custom Liquid", async () => {
  const result = await convertModuleToCustomLiquid({
    module: moduleFixture,
    css: ".reference-module { color: red; }",
    sourceUrl: "https://store.example/products/item",
    replacements: [{ from: "Original Product", to: "New Product" }],
    namespace: "ai-liquid-test-3",
    env: { DEEPSEEK_MOCK: "1" }
  });
  assert.match(result.code, /id="ai-liquid-test-3"/);
  assert.match(result.code, /New Product/);
  assert.equal(result.model, "mock");
});

test("AI JSON output is parsed and Markdown fences are removed", () => {
  const payload = JSON.stringify({
    code: "```liquid\n<div id=\"ai-liquid-test-3\">Ready</div>\n<style>#ai-liquid-test-3{display:block}</style>\n```",
    summary: "已生成",
    warnings: []
  });
  const result = parseDeepSeekResult(payload, "ai-liquid-test-3");
  assert.equal(result.code.startsWith("```"), false);
  assert.equal(result.summary, "已生成");
});

test("oversize Custom Liquid is compacted below Shopify's setting limit without changing scripts", () => {
  const script = "<script>(() => {\n  const label = 'Keep  two  spaces';\n  console.log(label);\n})();</script>";
  const oversized = `<div id="ai-liquid-test-3">\n<style>#ai-liquid-test-3 {${"\n  color: red;                 ".repeat(2200)}\n}</style>\n<p>Keep\n  words separated</p>\n${script}\n</div>`;
  assert.ok(Buffer.byteLength(oversized, "utf8") > 49_000);
  const compacted = compactCustomLiquidCode(oversized);
  assert.ok(Buffer.byteLength(compacted, "utf8") < 49_000);
  assert.match(compacted, /Keep words separated/);
  assert.match(compacted, /const label = 'Keep  two  spaces'/);
  assert.equal(validateCustomLiquid(compacted, "ai-liquid-test-3"), compacted);
});

test("server conversion automatically compacts an oversize provider result", async () => {
  const oversizedCode = `<div id="ai-liquid-test-3">\n<style>#ai-liquid-test-3 {${"\n  color: red;                 ".repeat(2200)}\n}</style>\n<p>Ready</p>\n</div>`;
  const fetchImpl = async () => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ code: oversizedCode, summary: "已生成", warnings: [] }) }, finish_reason: "stop" }],
    usage: { total_tokens: 10 },
    model: "deepseek-v4-flash"
  }), { status: 200 });
  const result = await convertModuleToCustomLiquid({
    module: moduleFixture,
    css: "",
    sourceUrl: "https://store.example/products/item",
    replacements: [],
    namespace: "ai-liquid-test-3",
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetchImpl
  });
  assert.equal(result.shopifyAudit.compacted, true);
  assert.ok(result.shopifyAudit.bytes < 49_000);
  assert.ok(result.shopifyAudit.originalBytes > 49_000);
});

test("unsafe generated network scripts are rejected", () => {
  assert.throws(
    () => validateCustomLiquid('<div id="ai-liquid-test-3"></div><script>fetch("https://example.com")</script>', "ai-liquid-test-3"),
    (error) => error instanceof ConversionError && error.code === "UNSAFE_SCRIPT_BLOCKED"
  );
});

test("provider authentication errors are mapped to actionable Chinese errors", async () => {
  await assert.rejects(
    () => convertModuleToCustomLiquid({
      module: moduleFixture,
      css: "",
      sourceUrl: "https://store.example/products/item",
      replacements: [],
      namespace: "ai-liquid-test-3",
      env: { DEEPSEEK_API_KEY: "bad-key" },
      fetchImpl: async () => new Response(JSON.stringify({ error: { message: "invalid key" } }), { status: 401 })
    }),
    (error) => error instanceof ConversionError && error.code === "DEEPSEEK_AUTH_FAILED" && error.status === 401
  );
});
