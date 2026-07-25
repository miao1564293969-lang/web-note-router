# 网页笔记路由器

Chrome Manifest V3 扩展。在网页中选中文字并按 `Ctrl+C` 后，扩展异步调用 DeepSeek，
根据自定义路由标签将内容追加到已授权原始库目录中的 Markdown 文件。

## 安装

1. 打开 `chrome://extensions/`。
2. 开启“开发者模式”。
3. 点击“加载已解压的扩展程序”，选择本目录。
4. 打开扩展设置，选择原始库目录。
5. 填写 `DEEPSEEK_API_KEY`，确认模型名和路由标签后保存。

## 使用

在普通网页中选中文字并按 `Ctrl+C`。复制行为本身不受影响，路由与写入会在后台异步执行。
成功或失败会通过浏览器通知反馈。

Chrome 内置页面、Chrome 扩展商店等受保护页面不允许内容脚本运行，因此无法捕获这些页面的复制事件。

## 安全说明

API Key 保存在 Chrome 本地扩展存储中，不会写入 Markdown 文件，但仍可被有本机 Chrome
配置访问权限的人读取。更严格的生产环境应通过自有后端代理 DeepSeek 请求。

## 开发验证

```cmd
npm.cmd test
npm.cmd run check
```

## Chrome Web Store 发布资料

- 隐私政策源文件：`PRIVACY.md`
- GitHub Pages 隐私政策：`docs/PRIVACY.html`
- 商店文案和审核说明：`store/LISTING.md`
- 商店截图：`store/assets/screenshot-settings-1280x800.png`
- 小型宣传图：`store/assets/promo-small-440x280.png`
- 扩展 PNG 图标：`icons/`

在 GitHub 仓库设置中启用 Pages，并选择从 `main` 分支的 `/docs` 目录部署后，
隐私政策地址为：

`https://miao1564293969-lang.github.io/web-note-router/PRIVACY.html`
