import {
  DEFAULT_SETTINGS,
  RecentHashCache,
  buildRoutePrompt,
  computeContentHash,
  containsSecret,
  formatMarkdownNote,
  normalizeSettings,
  parseRouteResponse
} from "./lib/core.js";
import { appendToMarkdown, ensureWritePermission, getDirectoryHandle, writeBinaryFile } from "./lib/directory-store.js";

let writeQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get("settings");
  if (!current.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CAPTURE_NOTE") return false;
  writeQueue = writeQueue.catch(() => {}).then(() => captureNote(message.payload));
  writeQueue.then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => {
      notify("笔记保存失败", error.message);
      sendResponse({ ok: false, error: error.message });
    }
  );
  return true;
});

async function captureNote(note) {
  const hasText = Boolean(note?.text?.trim());
  const hasImages = Boolean(note?.images?.length || note?.remoteImages?.length);
  if (!hasText && !hasImages) throw new Error("复制内容为空");

  const contentHash = await computeContentHash(note);
  const recentRecords = await loadRecentRecords();
  if (recentRecords.has(contentHash)) {
    return { duplicate: true, hash: contentHash };
  }

  const { settings: raw } = await chrome.storage.local.get("settings");
  const settings = normalizeSettings(raw);
  if (raw && Object.hasOwn(raw, "fallbackTag")) {
    await chrome.storage.local.set({ settings });
  }
  if (!settings.enabled) throw new Error("插件当前已暂停");
  const hasSecret = hasText && containsSecret(note.text);
  if (hasText && !hasSecret && !settings.apiKey) throw new Error("请先在设置页填写 DEEPSEEK_API_KEY");

  const rootHandle = await getDirectoryHandle();
  if (!rootHandle || !await ensureWritePermission(rootHandle)) {
    throw new Error("原始库目录未授权，请打开设置页重新选择目录");
  }

  const routeResult = hasSecret
    ? createSecretRoute(settings.routes)
    : hasText
      ? await routeWithDeepSeek(note, settings)
      : createImageRoute(settings.routes);
  if (routeResult.isNew) {
    settings.routes = [...settings.routes, {
      tag: routeResult.tag,
      file: routeResult.file,
      description: routeResult.description
    }];
    await chrome.storage.local.set({ settings });
  }
  const route = settings.routes.find((item) => item.tag === routeResult.tag);
  const localImages = await saveClipboardImages(rootHandle, note.images || []);
  const imagePaths = [...localImages, ...(note.remoteImages || [])];
  await appendToMarkdown(rootHandle, route.file, formatMarkdownNote({ ...note, imagePaths }, routeResult));
  recentRecords.add({
    hash: contentHash,
    savedAt: new Date().toISOString(),
    file: route.file
  });
  await chrome.storage.session.set({ recentRecords: recentRecords.entries() });
  await chrome.storage.local.set({
    lastResult: { ...routeResult, file: route.file, hash: contentHash, savedAt: new Date().toISOString() }
  });
  notify("网页笔记已保存", `${routeResult.tag} → ${route.file}`);
  return { ...routeResult, file: route.file, hash: contentHash };
}

async function loadRecentRecords() {
  const { recentRecords: stored = [] } = await chrome.storage.session.get("recentRecords");
  const cache = new RecentHashCache(10);
  for (const record of stored) cache.add(record);
  return cache;
}

function createSecretRoute(routes) {
  const existing = routes.find((route) => route.tag === "密钥" || route.file === "密钥.md");
  return existing
    ? { ...existing, title: "密钥记录", isNew: false }
    : {
        tag: "密钥",
        file: "密钥.md",
        description: "本地正则识别的密钥、令牌、密码和私钥，不发送给大模型",
        title: "密钥记录",
        isNew: true
      };
}

async function saveClipboardImages(rootHandle, images) {
  const paths = [];
  for (const image of images.slice(0, 5)) {
    const extension = extensionForMimeType(image.mimeType);
    const path = `attachments/web-note-router/${Date.now()}-${crypto.randomUUID()}.${extension}`;
    await writeBinaryFile(rootHandle, path, decodeBase64(image.data));
    paths.push(path);
  }
  return paths;
}

function extensionForMimeType(mimeType) {
  return {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif"
  }[mimeType] || "png";
}

function decodeBase64(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function routeWithDeepSeek(note, settings) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await fetch(settings.apiBaseUrl, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: buildRoutePrompt(settings.routes) },
          { role: "user", content: `网页标题：${note.pageTitle}\n网页地址：${note.url}\n复制内容：\n${note.text}` }
        ]
      })
    });
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("DeepSeek 请求超时（30 秒），请检查网络、接口地址或模型名称");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek 请求失败（${response.status}）：${body.slice(0, 200)}`);
  }
  const data = await response.json();
  return parseRouteResponse(data.choices?.[0]?.message?.content, settings.routes);
}

function createImageRoute(routes) {
  const existing = routes.find((route) => route.tag === "图片摘录");
  return existing
    ? { ...existing, title: "图片摘录", isNew: false }
    : {
        tag: "图片摘录",
        file: "图片摘录.md",
        description: "没有可用于文字路由的纯图片内容",
        title: "图片摘录",
        isNew: true
      };
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon128.png",
    title,
    message
  }).catch(() => {});
}
