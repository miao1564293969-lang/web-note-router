import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildRoutePrompt,
  computeContentHash,
  containsSecret,
  formatMarkdownNote,
  normalizeSettings,
  parseRouteResponse,
  RecentHashCache,
  sanitizeRelativeMarkdownPath
} from "../lib/core.js";

const routes = [
  { tag: "技术", file: "学习/技术.md", description: "技术内容" },
  { tag: "灵感", file: "灵感.md", description: "创意内容" }
];

test("清理并规范 Markdown 相对路径", () => {
  assert.equal(sanitizeRelativeMarkdownPath("学习\\AI"), "学习/AI.md");
  assert.equal(sanitizeRelativeMarkdownPath("../密钥.md"), "");
  assert.equal(sanitizeRelativeMarkdownPath("C:\\资料\\笔记.md"), "");
});

test("解析合法的模型路由 JSON", () => {
  assert.deepEqual(
    parseRouteResponse('```json\n{"action":"existing","tag":"技术","title":"异步请求"}\n```', routes),
    { tag: "技术", file: "学习/技术.md", description: "技术内容", title: "异步请求", isNew: false }
  );
});

test("现有路由不适用时解析并创建新路由", () => {
  assert.deepEqual(parseRouteResponse(JSON.stringify({
    action: "create",
    tag: "产品",
    file: "产品观察.md",
    description: "产品设计与市场观察",
    title: "新产品分析"
  }), routes), {
    tag: "产品",
    file: "产品观察.md",
    description: "产品设计与市场观察",
    title: "新产品分析",
    isNew: true
  });
});

test("模型输出异常时明确报错而非落入兜底", () => {
  assert.throws(() => parseRouteResponse("不是 JSON", routes), /有效的路由 JSON/);
});

test("设置中的空路由使用默认值并移除旧兜底配置", () => {
  assert.ok(normalizeSettings({ routes: [] }).routes.length > 0);
  const migrated = normalizeSettings({
    fallbackTag: "待整理",
    routes: [...routes, { tag: "待整理", file: "待整理.md", description: "旧兜底" }]
  });
  assert.equal(migrated.fallbackTag, undefined);
  assert.equal(migrated.routes.some((route) => route.tag === "待整理"), false);
});

test("路由提示要求不匹配时创建明确的新标签", () => {
  const prompt = buildRoutePrompt(routes);
  assert.match(prompt, /"action":"create"/);
  assert.match(prompt, /不要使用“其他”“未分类”“待整理”/);
});

test("识别常见密钥、Token、密码和私钥格式", () => {
  const secrets = [
    "DEEPSEEK_API_KEY=sk-1234567890abcdefghijklmnop",
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz.123456",
    "github_pat_1234567890abcdefghijklmnopqrst",
    "AKIAIOSFODNN7EXAMPLE",
    "密码：correct-horse-battery-staple",
    "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg"
  ];
  for (const secret of secrets) assert.equal(containsSecret(secret), true, secret);
});

test("普通短文本不会被误判为密钥", () => {
  assert.equal(containsSecret("这是一段普通的技术文章，介绍 API Key 的使用方式。"), false);
  assert.equal(containsSecret("token 数量为 1000"), false);
  assert.equal(containsSecret("pwd: short"), false);
});

test("密钥正则仅检查复制内容前 100 个字符", () => {
  const secret = "api_key=1234567890abcdef";
  assert.equal(containsSecret(`${"a".repeat(70)} ${secret}`), true);
  assert.equal(containsSecret(`${"a".repeat(100)}${secret}`), false);
});

test("相同剪贴板内容生成相同 SHA-256 且忽略网页来源", async () => {
  const first = await computeContentHash({
    text: "重复内容",
    images: [{ mimeType: "image/png", data: "aGVsbG8=" }],
    remoteImages: ["https://example.com/a.png"],
    url: "https://first.example"
  });
  const second = await computeContentHash({
    text: "重复内容",
    images: [{ mimeType: "image/png", data: "aGVsbG8=" }],
    remoteImages: ["https://example.com/a.png"],
    url: "https://second.example"
  });
  assert.equal(first, second);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, await computeContentHash({ text: "不同内容" }));
});

test("最近哈希缓存仅保留最新 10 条记录", () => {
  const cache = new RecentHashCache(10);
  for (let index = 0; index < 11; index += 1) {
    cache.add({ hash: `hash-${index}`, savedAt: String(index), file: "记录.md" });
  }
  assert.equal(cache.entries().length, 10);
  assert.equal(cache.has("hash-0"), false);
  assert.equal(cache.has("hash-1"), true);
  assert.equal(cache.has("hash-10"), true);
});

test("生成带来源、标签与时间的 Markdown", () => {
  const markdown = formatMarkdownNote(
    { text: "第一行\n第二行", url: "https://example.com", pageTitle: "示例" },
    { tag: "技术", title: "测试摘录" },
    new Date("2026-07-25T00:00:00.000Z")
  );
  assert.match(markdown, /## 测试摘录/);
  assert.match(markdown, /#技术/);
  assert.match(markdown, /> 第一行\n> 第二行/);
});

test("图片写入 Markdown 引用且不产生空引用块", () => {
  const markdown = formatMarkdownNote(
    {
      text: "",
      imagePaths: ["attachments/web-note-router/图片 1.png", "https://example.com/image.png"],
      url: "https://example.com",
      pageTitle: "图片页面"
    },
    { tag: "图片摘录", title: "图片摘录" },
    new Date("2026-07-25T00:00:00.000Z")
  );
  assert.match(markdown, /!\[网页摘录图片 1\]\(attachments\/web-note-router\/%E5%9B%BE%E7%89%87%201\.png\)/);
  assert.match(markdown, /!\[网页摘录图片 2\]\(https:\/\/example\.com\/image\.png\)/);
  assert.doesNotMatch(markdown, /^> /m);
});

test("复制事件包含路由处理中、成功和失败反馈", async () => {
  const contentScript = await readFile(new URL("../content.js", import.meta.url), "utf8");
  assert.match(contentScript, /正在本地检查并分析笔记路由/);
  assert.match(contentScript, /正在保存图片笔记/);
  assert.match(contentScript, /重复粘贴：最近 10 条记录中已存在/);
  assert.match(contentScript, /已路由到：\$\{result\.file\}/);
  assert.match(contentScript, /保存失败/);
  assert.match(contentScript, /读取剪贴板超时/);
  assert.match(contentScript, /笔记路由超时/);
  assert.match(contentScript, /扩展连接已失效，请刷新当前网页后重试/);
  assert.match(contentScript, /globalThis\.chrome\?\.runtime/);
  assert.match(contentScript, /extension context invalidated/);
  assert.match(contentScript, /receiving end does not exist/);
  assert.match(contentScript, /aria-live="polite"/);
});

test("后台路由包含请求超时和失败队列恢复", async () => {
  const background = await readFile(new URL("../background.js", import.meta.url), "utf8");
  assert.match(background, /controller\.abort\(\)/);
  assert.match(background, /DeepSeek 请求超时（30 秒）/);
  assert.match(background, /writeQueue\.catch\(\(\) => \{\}\)\.then/);
  assert.match(background, /hasSecret\s*\?\s*createSecretRoute/);
  assert.match(background, /file: "密钥\.md"/);
  assert.ok(background.indexOf("recentRecords.has") < background.indexOf("containsSecret(note.text)"));
  assert.match(background, /chrome\.storage\.session\.get/);
  assert.match(background, /chrome\.storage\.session\.set/);
});

test("Manifest 声明的商店图标存在且为 PNG", async () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.icons["128"], "icons/icon128.png");
  assert.ok(manifest.permissions.includes("clipboardRead"));
  for (const iconPath of Object.values(manifest.icons)) {
    const bytes = await readFile(new URL(iconPath, root));
    assert.equal(bytes.subarray(1, 4).toString(), "PNG");
  }
});

test("商店图片尺寸符合 Chrome Web Store 要求", async () => {
  const root = new URL("../", import.meta.url);
  const cases = [
    ["icons/icon128.png", 128, 128],
    ["store/assets/screenshot-settings-1280x800.png", 1280, 800],
    ["store/assets/promo-small-440x280.png", 440, 280],
    ["store/assets/promo-marquee-1400x560.png", 1400, 560]
  ];
  for (const [path, width, height] of cases) {
    const bytes = await readFile(new URL(path, root));
    assert.equal(bytes.readUInt32BE(16), width, `${path} 宽度`);
    assert.equal(bytes.readUInt32BE(20), height, `${path} 高度`);
  }
});
