export const DEFAULT_SETTINGS = Object.freeze({
  apiKey: "",
  apiBaseUrl: "https://api.deepseek.com/chat/completions",
  model: "deepseek-v4-flash",
  routes: [
    { tag: "技术", file: "技术笔记.md", description: "编程、软件、AI、工程实践" },
    { tag: "灵感", file: "灵感收集.md", description: "创意、想法、启发" }
  ],
  enabled: true
});

export function normalizeSettings(raw = {}) {
  const { fallbackTag: legacyFallbackTag, ...current } = raw;
  const routes = Array.isArray(raw.routes)
    ? raw.routes.map(normalizeRoute).filter((route) => route && route.tag !== legacyFallbackTag)
    : [];
  return { ...DEFAULT_SETTINGS, ...current, routes: routes.length ? routes : DEFAULT_SETTINGS.routes };
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

export function buildRoutePrompt(routes) {
  const choices = routes.map((route) =>
    `- ${route.tag}: ${route.description || "无说明"}`
  ).join("\n");
  return `你是网页笔记分类路由器。只返回 JSON，不要 Markdown 代码块。
优先判断内容是否适合以下已有标签：
${choices}
如果适合已有标签，返回：
{"action":"existing","tag":"已有标签","title":"简短标题"}
如果所有已有标签都不合适，必须创建一个明确的新分类，返回：
{"action":"create","tag":"新标签","file":"新标签.md","description":"分类说明","title":"简短标题"}
新标签应简洁稳定，不要使用“其他”“未分类”“待整理”等含糊名称。标题不超过 40 个汉字。`;
}

const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}\b/i,
  /(?:api[\s_-]?key|access[\s_-]?key|secret(?:[\s_-]?key)?|client[\s_-]?secret|token|password|passwd|pwd|密钥|密码|令牌)\s*[:=：]\s*["']?[^\s"',;]{8,}/i
];

export function containsSecret(text) {
  const value = String(text || "").slice(0, 100);
  return SECRET_PATTERNS.some((pattern) => pattern.test(value));
}

export function parseRouteResponse(content, routes) {
  const cleaned = String(content || "").trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  let parsed = {};
  try {
    parsed = JSON.parse(cleaned);
  } catch (error) {
    throw new Error("DeepSeek 未返回有效的路由 JSON");
  }
  const title = String(parsed.title || "网页摘录").replace(/[\r\n#]/g, " ").trim().slice(0, 80) || "网页摘录";
  const existing = routes.find((route) => route.tag === String(parsed.tag || "").trim());
  if (parsed.action !== "create" && existing) {
    return { ...existing, title, isNew: false };
  }

  const tag = sanitizeTag(parsed.tag);
  const file = sanitizeRelativeMarkdownPath(parsed.file || `${tag}.md`);
  if (!tag || !file) throw new Error("DeepSeek 返回的新路由标签无效");
  const duplicate = routes.find((route) => route.tag === tag || route.file === file);
  if (duplicate) return { ...duplicate, title, isNew: false };
  return {
    tag,
    file,
    description: String(parsed.description || `自动创建的“${tag}”分类`).replace(/[\r\n]/g, " ").trim().slice(0, 120),
    title,
    isNew: true
  };
}

function sanitizeTag(value) {
  return String(value || "").trim().replace(/[\\/#<>:"|?*\u0000-\u001F]/g, "").slice(0, 24);
}

export function formatMarkdownNote(note, routeResult, savedAt = new Date()) {
  const time = savedAt.toISOString();
  const sourceTitle = String(note.pageTitle || "未命名网页").replace(/[\r\n]/g, " ").trim();
  const url = String(note.url || "");
  const text = String(note.text || "").trim();
  const textSection = text ? `> ${text.replace(/\r?\n/g, "\n> ")}\n` : "";
  const imageSection = (note.imagePaths || []).length
    ? `\n${note.imagePaths.map((path, index) => `![网页摘录图片 ${index + 1}](${encodeMarkdownPath(path)})`).join("\n\n")}\n`
    : "";
  return `\n\n## ${routeResult.title}\n\n` +
    `- 标签：#${routeResult.tag}\n` +
    `- 来源：[${escapeMarkdown(sourceTitle)}](${url})\n` +
    `- 保存时间：${time}\n\n` +
    textSection +
    imageSection;
}

function escapeMarkdown(value) {
  return value.replaceAll("\\", "\\\\").replaceAll("[", "\\[").replaceAll("]", "\\]");
}

function encodeMarkdownPath(value) {
  const path = String(value);
  if (/^https?:\/\//i.test(path)) return encodeURI(path);
  return path.split("/").map((part) => encodeURIComponent(part)).join("/");
}
