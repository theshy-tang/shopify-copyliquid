# Shopify 模块提取器

输入公开的 Shopify 产品页链接，工具会用本机 Chrome 渲染页面，并从 `#MainContent` 中按顺序提取一级 `section` 和 `div` 模块。

## 运行

```powershell
npm.cmd install
npm.cmd start
```

浏览器打开 `http://localhost:4173`。

如果 Chrome 不在默认位置，可以先设置：

```powershell
$env:CHROME_PATH='C:\你的路径\chrome.exe'
npm.cmd start
```

## 配置 DeepSeek

API Key 只由服务端读取，不会写入浏览器代码或提取结果。先复制配置模板：

```powershell
Copy-Item .env.example .env
```

然后编辑 `.env`：

```dotenv
DEEPSEEK_API_KEY=你的_API_Key
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_THINKING=disabled
```

保存后重启 `npm.cmd start`。默认使用当前的 `deepseek-v4-flash`；需要更高质量时可改为 `deepseek-v4-pro`。`.env` 已加入 `.gitignore`，不要提交或发送 API Key。

本地验证完整交互但不调用 DeepSeek 时，可以临时设置 `DEEPSEEK_MOCK=1`。模拟结果只用于验证流程，不能代表 AI 改写质量。

## Custom Liquid 工作流

1. 提取产品页后，所有模块默认参与转换。
2. 点击模块右侧眼睛图标可排除模块；排除的模块不会发送给 DeepSeek，也不会产生对应 API 用量。
3. 在顶部添加“原文本 → 替换为”规则。替换只处理可见文本以及 `alt`、`title` 等内容属性，不会修改类名、链接和脚本。
4. 可以逐个生成，也可以按顺序生成所有选中且尚未生成的模块。
5. 每个结果都能切换 Liquid 预览和 Liquid 代码，并支持复制、下载和重新生成。
6. 修改替换规则后，已有结果会标记为需要重新生成，不会静默复用旧代码。
7. 评论模块会核对来源与输出的评论数量，并验证左右按钮、自动轮播、触摸滑动和响应式布局；首次结果不完整时会自动修复一次，仍未通过则阻止复制。

生成结果面向 Shopify 主题编辑器中的“Custom Liquid”模块，不包含 `{% schema %}`、完整 HTML 文档或主题 Section 文件。生成脚本会在没有同源权限的隔离 iframe 中预览；服务端会阻止外部脚本、网络请求和访问父页面状态的生成代码。

DeepSeek 的认证失败、余额不足、限流、服务过载、超时、输出截断和格式异常都会显示具体原因。提取上下文在服务端内存中保留 30 分钟，过期后需要重新提取页面。

## 提取规则

- 优先选择 `main#MainContent`，其次选择任意 `#MainContent`。
- 将它的一级 `section` 和 `div` 作为独立模块。
- 如果一级只有一个普通容器，并且容器内有多个 `.shopify-section`，自动使用里面的 Shopify 模块。
- 图片和链接等相对地址会转换为绝对地址。
- 提取前会有限度滚动页面，触发常见的图片懒加载。
- 每个模块会单独滚入视口并等待动画稳定，避免记录到半透明的动画中间帧。
- 预览会保留来源视口、`html/body` 属性、外链样式和 head 内联样式。
- 预览可以切换来源、平板和手机宽度，来源模式会等比缩放到工具宽度，内部排版断点保持不变。
- “复制纯 HTML”只复制模块节点；“复制完整文档”和下载会包含页面样式依赖及根节点环境。
- 为了安全，静态预览不会运行来源页面脚本。轮播、加购、弹窗和第三方应用交互可能不会工作。
- 原始静态预览会把 Splide 评论轮播转换为响应式网格，确保全部评论可见；AI 生成的 Custom Liquid 则会改写成不依赖主题库的原生交互轮播。
- 预览工具栏会显示图片资源加载失败数量。

工具提取的是浏览器渲染后的 HTML 和公开资源引用，不是商店后台原始 Liquid 模板。
