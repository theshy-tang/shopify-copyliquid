import test from "node:test";
import assert from "node:assert/strict";
import {
  ConversionError,
  applyImageReplacementsToText,
  applyTextReplacements,
  auditModuleCustomLiquid,
  auditReviewCustomLiquid,
  buildModuleContextPackage,
  compactCustomLiquidCode,
  convertModuleToCustomLiquid,
  extractFaqInventory,
  extractModuleRequirements,
  extractReviewInventory,
  getDeepSeekConfig,
  limitImageReviewSource,
  normalizeImageReplacements,
  optimizeModuleSourceForAi,
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

const mediaTextModuleFixture = {
  index: 2,
  tag: "div",
  id: "media-text",
  heading: "Reveal Softer Skin",
  originalSize: { width: 1440, height: 700 },
  html: '<section class="custom-columns"><div class="custom-columns__block-image"><img src="https://cdn.example/image.jpg" alt="Product ingredients"></div><div class="custom-columns__block-icon_with_text"><h2>Reveal Softer Skin</h2><p>Rich daily nourishment.</p></div></section>'
};

const faqModuleFixture = {
  index: 13,
  tag: "section",
  id: "faq",
  heading: "Frequently Asked Questions",
  originalSize: { width: 1440, height: 600 },
  html: '<section class="collapsible-content"><details><summary>Can I use it daily?</summary><div class="accordion__content">Yes, use a small amount once or twice daily.</div></details><details><summary>Is it suitable for sensitive skin?</summary><div class="accordion__content">Patch test first and stop use if irritation occurs.</div></details></section>'
};

const timelineModuleFixture = {
  index: 9,
  tag: "section",
  id: "timeline",
  heading: "What Skin Changes Can You Expect With Regular Use of This Tallow Facial Balm?",
  originalSize: { width: 1440, height: 818 },
  html: '<section class="timeline-section"><div class="page-width"><h2>What Skin Changes Can You Expect With Regular Use of This Tallow Facial Balm?</h2><ol class="timeline"><li><strong>1 WEEK</strong><p>The tallow base carries vitamins A, D, E and K deep into skin layers, so you will quickly notice a softer, more hydrated complexion within one week of application.</p></li><li><strong>1 MONTH</strong><p>Most users find their skin tone grows more balanced while fine lines start to fade visibly.</p></li></ol></div></section>'
};

function mediaTextLiquidCode() {
  return `<section id="ai-liquid-media-2"><div class="layout"><div class="media"><img src="https://cdn.example/image.jpg" alt="Product ingredients"></div><div class="copy"><h2>Reveal Softer Skin</h2><p>Rich daily nourishment.</p></div></div></section><style>#ai-liquid-media-2 .layout{display:grid;grid-template-columns:1fr;gap:24px}@media(min-width:750px){#ai-liquid-media-2 .layout{grid-template-columns:1fr 1fr}}</style>`;
}

function faqLiquidCode() {
  return `<section id="ai-liquid-faq-13"><h2>Frequently Asked Questions</h2><details><summary>Can I use it daily?</summary><div class="answer">Yes, use a small amount once or twice daily.</div></details><details><summary>Is it suitable for sensitive skin?</summary><div class="answer">Patch test first and stop use if irritation occurs.</div></details></section><style>#ai-liquid-faq-13 details{border-bottom:1px solid #ddd}#ai-liquid-faq-13 summary{cursor:pointer}</style>`;
}

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

test("image replacements update HTML and CSS URLs while rejecting unsafe targets", () => {
  const replacements = normalizeImageReplacements([
    { from: "https://cdn.example.com/old.jpg", to: "https://cdn.example.com/new.webp" },
    { from: "https://cdn.example.com/blocked.jpg", to: "javascript:alert(1)" }
  ]);
  assert.deepEqual(replacements, [{ from: "https://cdn.example.com/old.jpg", to: "https://cdn.example.com/new.webp" }]);
  const source = '<img src="https://cdn.example.com/old.jpg" srcset="https://cdn.example.com/old.jpg 800w"><style>.x{background:url(https://cdn.example.com/old.jpg)}</style>';
  const updated = applyImageReplacementsToText(source, replacements);
  assert.equal(updated.includes("https://cdn.example.com/old.jpg"), false);
  assert.equal((updated.match(/https:\/\/cdn\.example\.com\/new\.webp/g) || []).length, 3);
});

test("media and text modules require desktop columns and a mobile stack", () => {
  const requirements = extractModuleRequirements(
    mediaTextModuleFixture,
    mediaTextModuleFixture.html,
    ".custom-columns{display:flex}.custom-columns>div{width:50%}"
  );
  assert.equal(requirements.mediaText, true);

  const verticalOnly = '<section id="ai-liquid-media-2"><img src="https://cdn.example/image.jpg"><p>Rich daily nourishment.</p></section><style>#ai-liquid-media-2{display:block}</style>';
  const badAudit = auditModuleCustomLiquid(verticalOnly, requirements);
  assert.equal(badAudit.ok, false);
  assert.equal(badAudit.checks.hasDesktopColumns, false);

  const goodAudit = auditModuleCustomLiquid(mediaTextLiquidCode(), requirements);
  assert.equal(goodAudit.ok, true);
  assert.equal(goodAudit.checks.hasDesktopColumns, true);
  assert.equal(goodAudit.checks.hasResponsiveBreakpoint, true);
});

test("FAQ inventory and audit require complete native disclosure items", () => {
  const faq = extractFaqInventory(faqModuleFixture.html);
  assert.equal(faq.count, 2);
  assert.match(faq.items[0].answer, /once or twice daily/);
  const requirements = extractModuleRequirements(faqModuleFixture, faqModuleFixture.html, "");

  const questionsOnly = '<section id="ai-liquid-faq-13"><p>Can I use it daily?</p><p>Is it suitable for sensitive skin?</p></section>';
  const badAudit = auditModuleCustomLiquid(questionsOnly, requirements);
  assert.equal(badAudit.ok, false);
  assert.equal(badAudit.checks.faqOutputCount, 0);

  const goodAudit = auditModuleCustomLiquid(faqLiquidCode(), requirements);
  assert.equal(goodAudit.ok, true);
  assert.equal(goodAudit.checks.faqSemanticCount, 2);
});

test("page-width modules require a centered desktop shell and safe long-text wrapping", () => {
  const requirements = extractModuleRequirements(
    timelineModuleFixture,
    timelineModuleFixture.html,
    ".page-width{max-width:140rem;margin:0 auto;padding:0 5rem}"
  );
  assert.equal(requirements.centeredContent, true);

  const unbounded = '<section id="ai-liquid-timeline-9"><h2>What Skin Changes Can You Expect With Regular Use of This Tallow Facial Balm?</h2><ol><li><p>A very long result description.</p></li></ol></section><style>#ai-liquid-timeline-9{padding:36px 5rem}</style>';
  const audit = auditModuleCustomLiquid(unbounded, requirements);
  assert.equal(audit.ok, false);
  assert.equal(audit.checks.hasCenteredContentShell, false);
  assert.equal(audit.checks.hasSafeTextWrapping, false);
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

test("module source optimization strips technical noise while preserving visible content", () => {
  const noisy = `<section class="shopify-section section huge extra classes that keep growing" data-section-id="abc" x-data="{ open: true }" onclick="track()">
    <style>.huge{color:red}</style>
    <script>expensiveThemeCode()</script>
    <h2 data-block-id="title">Adopt a Ghost Necklace</h2>
    <img src="https://cdn.example.com/ghost.jpg" srcset="https://cdn.example.com/ghost-small.jpg 360w, https://cdn.example.com/ghost-large.jpg 1200w" alt="Glow ghost pendant">
    <svg aria-label="sparkle icon"><path d="M0 0L9 9"></path></svg>
  </section>`;
  const optimized = optimizeModuleSourceForAi(noisy, { aggressive: true });
  assert.match(optimized, /Adopt a Ghost Necklace/);
  assert.match(optimized, /https:\/\/cdn\.example\.com\/ghost\.jpg/);
  assert.match(optimized, /Glow ghost pendant/);
  assert.match(optimized, /sparkle icon/);
  assert.doesNotMatch(optimized, /<script|<style|data-section-id|x-data|onclick|<svg/i);
  assert.ok(Buffer.byteLength(optimized, "utf8") < Buffer.byteLength(noisy, "utf8") / 2);

  const lazyOptimized = optimizeModuleSourceForAi(
    `<div><img data-srcset="https://cdn.example.com/lazy-small.jpg 360w, https://cdn.example.com/lazy-large.jpg 1200w" alt="Lazy image"></div>`,
    { aggressive: true }
  );
  assert.match(lazyOptimized, /https:\/\/cdn\.example\.com\/lazy-large\.jpg/);
  assert.match(lazyOptimized, /Lazy image/);
  assert.doesNotMatch(lazyOptimized, /data-srcset/);
});

test("module context package preserves original detail for compact retries", () => {
  const html = `<section class="media-text" data-section-id="abc">
    <h2>Adopt a Ghost Necklace</h2>
    <p>Bring home your tiny ghost companion and let it glow through spooky season.</p>
    <img src="https://cdn.example.com/ghost.jpg" alt="Glow ghost pendant">
    <a href="https://example.com/size-guide">Size guide</a>
  </section>`;
  const context = buildModuleContextPackage({
    module: { ...moduleFixture, heading: "Adopt a Ghost Necklace", originalSize: { width: 1440, height: 620 } },
    html,
    css: ".media-text{display:grid;grid-template-columns:1fr 1fr;color:#123456;font-family:Inter,sans-serif;gap:32px}",
    requirements: { mediaText: true, centeredContent: false },
    reviewInventory: null,
    compactLevel: 2
  });
  assert.match(context.fullText, /tiny ghost companion/);
  assert.equal(context.images[0].url, "https://cdn.example.com/ghost.jpg");
  assert.equal(context.images[0].alt, "Glow ghost pendant");
  assert.equal(context.links[0].text, "Size guide");
  assert.equal(context.requirements.desktopMediaText, true);
  assert.ok(context.cssHints.colors.includes("#123456"));
  assert.ok(context.cssHints.layout.some((item) => /grid-template-columns/i.test(item)));
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

test("desktop media and text layout is automatically repaired when the model stacks it", async () => {
  const requests = [];
  const verticalOnly = '<section id="ai-liquid-media-2"><img src="https://cdn.example/image.jpg" alt="Product ingredients"><h2>Reveal Softer Skin</h2><p>Rich daily nourishment.</p></section><style>#ai-liquid-media-2{display:block}</style>';
  const providerResponse = (code) => new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify({ code, summary: "generated", warnings: [] }) }, finish_reason: "stop" }],
    usage: { total_tokens: 20 },
    model: "deepseek-v4-flash"
  }), { status: 200 });
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return providerResponse(requests.length === 1 ? verticalOnly : mediaTextLiquidCode());
  };

  const result = await convertModuleToCustomLiquid({
    module: mediaTextModuleFixture,
    css: ".custom-columns{display:flex}.custom-columns>div{width:50%}",
    sourceUrl: "https://store.example/products/item",
    replacements: [],
    namespace: "ai-liquid-media-2",
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetchImpl
  });

  assert.equal(requests.length, 2);
  assert.match(requests[0].messages[1].content, /Never stack them vertically on desktop/);
  assert.match(requests[1].messages[1].content, /CURRENT AUDIT FAILURES/);
  assert.equal(result.moduleAudit.repaired, true);
  assert.equal(result.moduleAudit.hasDesktopColumns, true);
});

test("FAQ conversion keeps native details and adds a full-height expansion safeguard", async () => {
  const requests = [];
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ code: faqLiquidCode(), summary: "generated", warnings: [] }) }, finish_reason: "stop" }],
      usage: { total_tokens: 20 },
      model: "deepseek-v4-flash"
    }), { status: 200 });
  };

  const result = await convertModuleToCustomLiquid({
    module: faqModuleFixture,
    css: ".accordion__content-wrapper{display:grid;grid-template-rows:0fr;overflow:hidden}",
    sourceUrl: "https://store.example/products/item",
    replacements: [],
    namespace: "ai-liquid-faq-13",
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetchImpl
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[1].content, /Use one native <details> element per FAQ item/);
  assert.match(result.code, /data-ai-faq-expansion/);
  assert.match(result.code, /max-height:none!important/);
  assert.equal(result.moduleAudit.faqOutputCount, 2);
});

test("compact retry sends a source context package with original details", async () => {
  const requests = [];
  const compactModule = {
    index: 21,
    tag: "section",
    id: "ghost-necklace",
    heading: "Adopt a Ghost Necklace",
    html: `<section class="shopify-section ghost" data-section-id="abc">
      <script>themeCarousel()</script>
      <h2>Adopt a Ghost Necklace</h2>
      <p>Bring home your tiny ghost companion and let it glow through spooky season.</p>
      <img src="https://cdn.example.com/ghost.jpg" alt="Glow ghost pendant">
    </section>`
  };
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            code: '<section id="ai-liquid-compact-21"><h2>Adopt a Ghost Necklace</h2><p>Bring home your tiny ghost companion and let it glow through spooky season.</p><img src="https://cdn.example.com/ghost.jpg" alt="Glow ghost pendant"></section>',
            summary: "generated",
            warnings: []
          })
        },
        finish_reason: "stop"
      }],
      usage: { total_tokens: 20 },
      model: "deepseek-v4-flash"
    }), { status: 200 });
  };

  const result = await convertModuleToCustomLiquid({
    module: compactModule,
    css: ".ghost{display:grid;grid-template-columns:1fr 1fr;color:#123456}",
    sourceUrl: "https://store.example/products/ghost",
    replacements: [],
    namespace: "ai-liquid-compact-21",
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetchImpl,
    compactMode: true,
    compactLevel: 2
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[1].content, /<SOURCE_CONTEXT_PACKAGE>/);
  assert.match(requests[0].messages[1].content, /tiny ghost companion/);
  assert.match(requests[0].messages[1].content, /https:\/\/cdn\.example\.com\/ghost\.jpg/);
  assert.equal(result.requestAudit.compactMode, true);
  assert.equal(result.requestAudit.compactLevel, 2);
  assert.ok(result.requestAudit.sourceContextBytes > 100);
  assert.match(result.warnings.join(" "), /上下文包/);
});

test("conversion deterministically centers bounded modules and wraps long text without another model call", async () => {
  const requests = [];
  const modelCode = `<section id="ai-liquid-timeline-9"><h2>What Skin Changes Can You Expect With Regular Use of This Tallow Facial Balm?</h2><ol><li><strong>1 WEEK</strong><p>The tallow base carries vitamins A, D, E and K deep into skin layers, so you will quickly notice a softer, more hydrated complexion within one week of application.</p></li><li><strong>1 MONTH</strong><p>Most users find their skin tone grows more balanced while fine lines start to fade visibly.</p></li></ol></section><style>#ai-liquid-timeline-9{background:#fdfdfd;padding:36px 5rem}</style>`;
  const fetchImpl = async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ code: modelCode, summary: "generated", warnings: [] }) }, finish_reason: "stop" }],
      usage: { total_tokens: 20 },
      model: "deepseek-v4-flash"
    }), { status: 200 });
  };

  const result = await convertModuleToCustomLiquid({
    module: timelineModuleFixture,
    css: ".page-width{max-width:140rem;margin:0 auto;padding:0 5rem}",
    sourceUrl: "https://store.example/products/item",
    replacements: [],
    namespace: "ai-liquid-timeline-9",
    env: { DEEPSEEK_API_KEY: "test-key" },
    fetchImpl
  });

  assert.equal(requests.length, 1);
  assert.match(requests[0].messages[1].content, /max-width: 1400px/);
  assert.match(result.code, /data-ai-layout-safety/);
  assert.match(result.code, /max-width:1400px;margin-inline:auto/);
  assert.match(result.code, /overflow-wrap:anywhere/);
  assert.equal(result.moduleAudit.hasCenteredContentShell, true);
  assert.equal(result.moduleAudit.hasSafeTextWrapping, true);
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

test("AI JSON output can be recovered from explanatory Markdown responses", () => {
  const payload = JSON.stringify({
    code: "<div id=\"ai-liquid-test-3\">Ready</div>",
    summary: "已生成",
    warnings: []
  });
  const result = parseDeepSeekResult(`Here is the result:\n\n\`\`\`json\n${payload}\n\`\`\``, "ai-liquid-test-3");
  assert.equal(result.code, "<div id=\"ai-liquid-test-3\">Ready</div>");
  assert.equal(result.summary, "已生成");
});

test("raw Custom Liquid output is accepted when a model ignores the JSON contract", () => {
  const result = parseDeepSeekResult(
    "```liquid\n<div id=\"ai-liquid-test-3\"><p>Ready</p></div>\n<style>#ai-liquid-test-3{display:block}</style>\n```",
    "ai-liquid-test-3"
  );
  assert.match(result.code, /<div id="ai-liquid-test-3">/);
  assert.match(result.warnings.join(" "), /非 JSON/);
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

test("New API uses the OpenAI-compatible v1 endpoint and generic reasoning option", async () => {
  let requestUrl = "";
  let requestHeaders;
  let requestBody;
  const fetchImpl = async (url, init) => {
    requestUrl = url;
    requestHeaders = init.headers;
    requestBody = JSON.parse(init.body);
    return new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ code: '<div id="ai-liquid-test-3">Ready</div>', summary: "已生成", warnings: [] }) }, finish_reason: "stop" }],
      usage: { total_tokens: 12 },
      model: "gateway-model"
    }), { status: 200 });
  };
  const result = await convertModuleToCustomLiquid({
    module: moduleFixture,
    css: "",
    sourceUrl: "https://store.example/products/item",
    replacements: [],
    namespace: "ai-liquid-test-3",
    env: {
      AI_PROVIDER: "newapi",
      AI_API_KEY: "newapi-token",
      AI_BASE_URL: "https://gateway.example.com",
      AI_MODEL: "gateway-model",
      AI_THINKING: "enabled"
    },
    fetchImpl
  });
  assert.equal(requestUrl, "https://gateway.example.com/v1/chat/completions");
  assert.equal(requestHeaders.Authorization, "Bearer newapi-token");
  assert.equal(requestBody.model, "gateway-model");
  assert.equal(requestBody.reasoning_effort, "high");
  assert.equal("thinking" in requestBody, false);
  assert.equal(result.model, "gateway-model");
});

test("New API content parts are normalized before parsing the generated JSON", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: [{
          type: "text",
          text: JSON.stringify({
            code: '<div id="ai-liquid-test-3">Ready</div>',
            summary: "已生成",
            warnings: []
          })
        }]
      },
      finish_reason: "stop"
    }],
    usage: { total_tokens: 12 },
    model: "grok-4.5"
  }), { status: 200 });
  const result = await convertModuleToCustomLiquid({
    module: moduleFixture,
    css: "",
    sourceUrl: "https://store.example/products/item",
    replacements: [],
    namespace: "ai-liquid-test-3",
    env: {
      AI_PROVIDER: "newapi",
      AI_API_KEY: "newapi-token",
      AI_BASE_URL: "https://gateway.example.com",
      AI_MODEL: "grok-4.5"
    },
    fetchImpl
  });
  assert.match(result.code, /<div id="ai-liquid-test-3">Ready<\/div>/);
  assert.equal(result.model, "grok-4.5");
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
