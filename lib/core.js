export const DEFAULT_SETTINGS = Object.freeze({
  apiKey: "",
  apiBaseUrl: "https://api.deepseek.com/chat/completions",
  model: "deepseek-v4-flash",
  routes: [
    { tag: "技术", file: "技术笔记.md", description: "编程、软件、AI、工程实践" },
    { tag: "灵感", file: "灵感收集.md", description: "创意、想法、启发" },
    { tag: "待整理", file: "待整理.md", description: "无法明确分类的内容" }
  ],
  fallbackTag: "待整理",
  enabled: true
});

export function normalizeSettings(raw = {}) {
  const routes = Array.isArray(raw.routes) ? raw.routes.map(normalizeRoute).filter(Boolean) : [];
  const merged = { ...DEFAULT_SETTINGS, ...raw, routes: routes.length ? routes : DEFAULT_SETTINGS.routes };
  if (!merged.routes.some((route) => route.tag === merged.fallbackTag)) {
    merged.fallbackTag = merged.routes[merged.routes.length - 1].tag;
  }
  return merged;
}

export function normalizeRoute(route) {
  const tag = String(route?.tag || "").trim();
  const description = String(route?.description || "").trim();
  const file = sanitizeRelativeMarkdownPath(route?.file);
  return tag && file ? { tag, file, description } : null;
}

export function sanitizeRelativeMarkdownPath(input) {
  const value = String(input || "").trim().replaceAll("\\", "/");
  if (!value || value.startsWith("/") || /^[A-Za-z]:/.test(value)) return "";
  const parts = value.split("/").filter(Boolean);
  if (!parts.length || parts.some((part) => part === "." || part === "..")) return "";
  const safe = parts.map((part) => part.replace(/[<>:"|?*\u0000-\u001F]/g, "_"));
  const last = safe.at(-1);
  if (!last.toLowerCase().endsWith(".md")) safe[safe.length - 1] = `${last}.md`;
  return safe.join("/");
}

export function buildRoutePrompt(routes, fallbackTag) {
  const choices = routes.map((route) =>
    `- ${route.tag}: ${route.description || "无说明"}`
  ).join("\n");
  return `你是网页笔记分类路由器。只返回 JSON，不要 Markdown 代码块。
格式：{"tag":"标签","title":"简短标题"}
标签必须严格选自以下列表：
${choices}
如果无法判断，选择“${fallbackTag}”。标题不超过 40 个汉字。`;
}

export function parseRouteResponse(content, routes, fallbackTag) {
  const cleaned = String(content || "").trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = {};
  }
  const allowed = new Set(routes.map((route) => route.tag));
  const tag = allowed.has(parsed.tag) ? parsed.tag : fallbackTag;
  const title = String(parsed.title || "网页摘录").replace(/[\r\n#]/g, " ").trim().slice(0, 80) || "网页摘录";
  return { tag, title };
}

export function formatMarkdownNote(note, routeResult, savedAt = new Date()) {
  const time = savedAt.toISOString();
  const sourceTitle = String(note.pageTitle || "未命名网页").replace(/[\r\n]/g, " ").trim();
  const url = String(note.url || "");
  const text = String(note.text || "").trim();
  return `\n\n## ${routeResult.title}\n\n` +
    `- 标签：#${routeResult.tag}\n` +
    `- 来源：[${escapeMarkdown(sourceTitle)}](${url})\n` +
    `- 保存时间：${time}\n\n` +
    `> ${text.replace(/\r?\n/g, "\n> ")}\n`;
}

function escapeMarkdown(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}
