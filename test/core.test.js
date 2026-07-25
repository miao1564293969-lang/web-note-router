import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  formatMarkdownNote,
  normalizeSettings,
  parseRouteResponse,
  sanitizeRelativeMarkdownPath
} from "../lib/core.js";

const routes = [
  { tag: "技术", file: "学习/技术.md", description: "技术内容" },
  { tag: "待整理", file: "待整理.md", description: "兜底" }
];

test("清理并规范 Markdown 相对路径", () => {
  assert.equal(sanitizeRelativeMarkdownPath("学习\\AI"), "学习/AI.md");
  assert.equal(sanitizeRelativeMarkdownPath("../密钥.md"), "");
  assert.equal(sanitizeRelativeMarkdownPath("C:\\资料\\笔记.md"), "");
});

test("解析合法的模型路由 JSON", () => {
  assert.deepEqual(
    parseRouteResponse('```json\n{"tag":"技术","title":"异步请求"}\n```', routes, "待整理"),
    { tag: "技术", title: "异步请求" }
  );
});

test("模型输出异常时走兜底路由", () => {
  assert.deepEqual(parseRouteResponse("不是 JSON", routes, "待整理"), {
    tag: "待整理",
    title: "网页摘录"
  });
});

test("设置中的空路由回退到默认值", () => {
  assert.ok(normalizeSettings({ routes: [] }).routes.length > 0);
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

test("复制事件包含路由处理中、成功和失败反馈", async () => {
  const contentScript = await readFile(new URL("../content.js", import.meta.url), "utf8");
  assert.match(contentScript, /正在分析笔记路由/);
  assert.match(contentScript, /已路由到：\$\{result\.file\}/);
  assert.match(contentScript, /保存失败/);
  assert.match(contentScript, /aria-live="polite"/);
});

test("Manifest 声明的商店图标存在且为 PNG", async () => {
  const root = new URL("../", import.meta.url);
  const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8"));
  assert.equal(manifest.icons["128"], "icons/icon128.png");
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
    ["store/assets/promo-small-440x280.png", 440, 280]
  ];
  for (const [path, width, height] of cases) {
    const bytes = await readFile(new URL(path, root));
    assert.equal(bytes.readUInt32BE(16), width, `${path} 宽度`);
    assert.equal(bytes.readUInt32BE(20), height, `${path} 高度`);
  }
});
