import { DEFAULT_SETTINGS, normalizeSettings, normalizeRoute } from "./lib/core.js";
import { ensureWritePermission, getDirectoryHandle, saveDirectoryHandle } from "./lib/directory-store.js";

const form = document.querySelector("#settingsForm");
const routesElement = document.querySelector("#routes");
const template = document.querySelector("#routeTemplate");
const message = document.querySelector("#message");

init();

async function init() {
  const { settings } = await chrome.storage.local.get("settings");
  renderSettings(normalizeSettings(settings || DEFAULT_SETTINGS));
  await refreshDirectoryStatus();
}

function renderSettings(settings) {
  document.querySelector("#apiKey").value = settings.apiKey;
  document.querySelector("#apiBaseUrl").value = settings.apiBaseUrl;
  document.querySelector("#model").value = settings.model;
  document.querySelector("#enabled").checked = settings.enabled;
  routesElement.replaceChildren();
  settings.routes.forEach(addRouteRow);
}

function addRouteRow(route = { tag: "", file: "", description: "" }) {
  const row = template.content.firstElementChild.cloneNode(true);
  for (const [key, value] of Object.entries(route)) {
    const input = row.querySelector(`[data-field="${key}"]`);
    if (input) input.value = value;
  }
  row.querySelector('[data-action="remove"]').addEventListener("click", () => {
    row.remove();
  });
  routesElement.append(row);
}

function getRoutes() {
  return [...routesElement.querySelectorAll(".route")].map((row) => normalizeRoute({
    tag: row.querySelector('[data-field="tag"]').value,
    file: row.querySelector('[data-field="file"]').value,
    description: row.querySelector('[data-field="description"]').value
  })).filter(Boolean);
}

document.querySelector("#addRoute").addEventListener("click", () => addRouteRow());

document.querySelector("#chooseDirectory").addEventListener("click", async () => {
  try {
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    if (!await ensureWritePermission(handle, true)) throw new Error("未获得目录写入权限");
    await saveDirectoryHandle(handle);
    await refreshDirectoryStatus();
  } catch (error) {
    if (error.name !== "AbortError") showMessage(error.message, true);
  }
});

async function refreshDirectoryStatus() {
  const status = document.querySelector("#directoryStatus");
  const handle = await getDirectoryHandle();
  const permitted = handle && await ensureWritePermission(handle);
  status.textContent = permitted ? `已授权：${handle.name}` : handle ? `需要重新授权：${handle.name}` : "尚未授权目录";
  status.className = permitted ? "success" : "warning";
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const routes = getRoutes();
  if (!routes.length) return showMessage("请至少配置一个有效路由标签", true);
  const settings = normalizeSettings({
    apiKey: document.querySelector("#apiKey").value.trim(),
    apiBaseUrl: document.querySelector("#apiBaseUrl").value.trim(),
    model: document.querySelector("#model").value.trim(),
    enabled: document.querySelector("#enabled").checked,
    routes
  });
  await chrome.storage.local.set({ settings });
  showMessage("设置已保存");
});

function showMessage(text, isError = false) {
  message.textContent = text;
  message.className = isError ? "error" : "success";
}
