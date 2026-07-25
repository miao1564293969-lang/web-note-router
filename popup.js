chrome.storage.local.get(["settings", "lastResult"]).then(({ settings, lastResult }) => {
  document.querySelector("#state").textContent = settings?.enabled === false ? "当前已暂停" : "复制网页文字即可自动保存";
  if (lastResult) {
    document.querySelector("#lastResult").textContent = `最近：${lastResult.tag} → ${lastResult.file}`;
  }
});
document.querySelector("#openOptions").addEventListener("click", () => chrome.runtime.openOptionsPage());
