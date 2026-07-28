document.addEventListener("copy", () => {
  const selectedText = window.getSelection()?.toString().trim() || "";
  setTimeout(() => captureClipboardNote(selectedText), 0);
}, true);

async function captureClipboardNote(selectedText) {
  try {
    let clipboard;
    try {
      clipboard = await withTimeout(readClipboardContent(), 5000, "读取剪贴板超时");
    } catch (error) {
      if (!selectedText) throw error;
      clipboard = { text: selectedText, images: [], remoteImages: [] };
    }
    const text = clipboard.text.trim() || selectedText;
    if (!text && !clipboard.images.length && !clipboard.remoteImages.length) return;

    showRouteToast(text ? "正在本地检查并分析笔记路由…" : "正在保存图片笔记…", "loading");
    const result = await withTimeout(sendToExtension({
      type: "CAPTURE_NOTE",
      payload: {
        text,
        images: clipboard.images,
        remoteImages: clipboard.remoteImages,
        url: location.href,
        pageTitle: document.title
      }
    }), 45000, "笔记路由超时，请检查网络或 DeepSeek 配置");
    if (result?.duplicate) {
      showRouteToast("重复粘贴：最近 10 条记录中已存在", "warning");
      return;
    }
    if (result?.ok) {
      showRouteToast(`已路由到：${result.file}`, "success", result.tag);
      return;
    }
    showRouteToast(`保存失败：${result?.error || "未知错误"}`, "error");
  } catch (error) {
    showRouteToast(`保存失败：${friendlyErrorMessage(error)}`, "error");
  }
}

async function sendToExtension(message) {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.sendMessage) {
    throw new Error("扩展连接已失效，请刷新当前网页后重试");
  }
  try {
    return await runtime.sendMessage(message);
  } catch (error) {
    if (isInvalidatedContext(error)) {
      throw new Error("扩展连接已失效，请刷新当前网页后重试");
    }
    throw error;
  }
}

function friendlyErrorMessage(error) {
  if (isInvalidatedContext(error)) return "扩展连接已失效，请刷新当前网页后重试";
  return error?.message || "扩展通信异常";
}

function isInvalidatedContext(error) {
  return /extension context invalidated|receiving end does not exist/i.test(error?.message || "");
}

async function readClipboardContent() {
  const result = { text: "", images: [], remoteImages: [] };
  if (!navigator.clipboard?.read) return result;

  const items = await navigator.clipboard.read();
  let totalImageBytes = 0;
  for (const item of items) {
    if (item.types.includes("text/plain") && !result.text) {
      result.text = await (await item.getType("text/plain")).text();
    }
    if (item.types.includes("text/html")) {
      const html = await (await item.getType("text/html")).text();
      result.remoteImages.push(...extractRemoteImages(html));
    }
    for (const type of item.types.filter((value) => value.startsWith("image/"))) {
      const blob = await item.getType(type);
      totalImageBytes += blob.size;
      if (blob.size > 10 * 1024 * 1024 || totalImageBytes > 20 * 1024 * 1024) {
        throw new Error("复制图片过大，单张不能超过 10MB，总计不能超过 20MB");
      }
      result.images.push({ mimeType: blob.type || type, data: await blobToBase64(blob) });
    }
  }
  result.remoteImages = [...new Set(result.remoteImages)].slice(0, 10);
  return result;
}

function extractRemoteImages(html) {
  if (!html) return [];
  const document = new DOMParser().parseFromString(html, "text/html");
  return [...document.querySelectorAll("img")]
    .map((image) => image.currentSrc || image.src)
    .filter((src) => /^https?:\/\//i.test(src));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function withTimeout(promise, timeoutMs, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

let toastTimer;

function showRouteToast(message, state, tag = "") {
  let host = document.querySelector("#web-note-router-toast-host");
  if (!host) {
    host = document.createElement("div");
    host.id = "web-note-router-toast-host";
    host.style.cssText = "all:initial;position:fixed;right:20px;bottom:20px;z-index:2147483647";
    const shadow = host.attachShadow({ mode: "closed" });
    host.__routeToastRoot = shadow;
    shadow.innerHTML = `
      <style>
        .toast {
          width: min(360px, calc(100vw - 32px));
          padding: 14px 16px;
          border: 1px solid #d8d3c5;
          border-radius: 14px;
          color: #17211b;
          background: #fffdf7;
          box-shadow: 0 14px 42px rgba(23, 33, 27, .2);
          font: 600 14px/1.5 Inter, "Microsoft YaHei", system-ui, sans-serif;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity .18s ease, transform .18s ease;
        }
        .toast.visible { opacity: 1; transform: translateY(0); }
        .toast.success { border-left: 5px solid #155e45; }
        .toast.error { border-left: 5px solid #a33b20; }
        .toast.loading { border-left: 5px solid #b48624; }
        .toast.warning { border-left: 5px solid #b48624; }
        .tag { display: block; margin-top: 3px; color: #66736b; font-size: 12px; }
      </style>
      <div class="toast" role="status" aria-live="polite">
        <span class="message"></span>
        <span class="tag"></span>
      </div>`;
    document.documentElement.append(host);
  }

  updateToast(host.__routeToastRoot, message, state, tag);
}

function updateToast(root, message, state, tag) {
  const toast = root.querySelector(".toast");
  root.querySelector(".message").textContent = message;
  const tagElement = root.querySelector(".tag");
  tagElement.textContent = tag ? `路由标签：${tag}` : "";
  toast.className = `toast ${state}`;
  requestAnimationFrame(() => toast.classList.add("visible"));
  clearTimeout(toastTimer);
  if (state !== "loading") {
    toastTimer = setTimeout(() => toast.classList.remove("visible"), state === "error" ? 6000 : 4000);
  }
}
