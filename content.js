document.addEventListener("copy", () => {
  const text = window.getSelection()?.toString().trim();
  if (!text) return;
  showRouteToast("正在分析笔记路由…", "loading");
  chrome.runtime.sendMessage({
    type: "CAPTURE_NOTE",
    payload: {
      text,
      url: location.href,
      pageTitle: document.title
    }
  }).then((result) => {
    if (result?.ok) {
      showRouteToast(`已路由到：${result.file}`, "success", result.tag);
      return;
    }
    showRouteToast(`保存失败：${result?.error || "未知错误"}`, "error");
  }).catch((error) => {
    showRouteToast(`保存失败：${error.message || "扩展通信异常"}`, "error");
  });
}, true);

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
