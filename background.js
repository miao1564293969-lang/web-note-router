import { DEFAULT_SETTINGS, buildRoutePrompt, formatMarkdownNote, normalizeSettings, parseRouteResponse } from "./lib/core.js";
import { appendToMarkdown, ensureWritePermission, getDirectoryHandle } from "./lib/directory-store.js";

let writeQueue = Promise.resolve();

chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get("settings");
  if (!current.settings) await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "CAPTURE_NOTE") return false;
  writeQueue = writeQueue.then(() => captureNote(message.payload));
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
  const { settings: raw } = await chrome.storage.local.get("settings");
  const settings = normalizeSettings(raw);
  if (!settings.enabled) throw new Error("插件当前已暂停");
  if (!settings.apiKey) throw new Error("请先在设置页填写 DEEPSEEK_API_KEY");
  if (!note?.text?.trim()) throw new Error("复制内容为空");

  const rootHandle = await getDirectoryHandle();
  if (!rootHandle || !await ensureWritePermission(rootHandle)) {
    throw new Error("原始库目录未授权，请打开设置页重新选择目录");
  }

  const routeResult = await routeWithDeepSeek(note, settings);
  const route = settings.routes.find((item) => item.tag === routeResult.tag)
    || settings.routes.find((item) => item.tag === settings.fallbackTag);
  await appendToMarkdown(rootHandle, route.file, formatMarkdownNote(note, routeResult));
  await chrome.storage.local.set({
    lastResult: { ...routeResult, file: route.file, savedAt: new Date().toISOString() }
  });
  notify("网页笔记已保存", `${routeResult.tag} → ${route.file}`);
  return { ...routeResult, file: route.file };
}

async function routeWithDeepSeek(note, settings) {
  const response = await fetch(settings.apiBaseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: buildRoutePrompt(settings.routes, settings.fallbackTag) },
        { role: "user", content: `网页标题：${note.pageTitle}\n网页地址：${note.url}\n复制内容：\n${note.text}` }
      ]
    })
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DeepSeek 请求失败（${response.status}）：${body.slice(0, 200)}`);
  }
  const data = await response.json();
  return parseRouteResponse(data.choices?.[0]?.message?.content, settings.routes, settings.fallbackTag);
}

function notify(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icon.svg",
    title,
    message
  }).catch(() => {});
}
