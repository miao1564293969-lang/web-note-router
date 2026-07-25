# Chrome Web Store 商店资料

## 名称

网页笔记路由器

## 简短说明

复制网页文字，通过 DeepSeek 自动分类并保存到本地 Markdown 原始库。

## 详细说明

网页笔记路由器让网页摘录自然进入你的 Markdown 知识库。

在普通网页中选中文字并按下 Ctrl+C，扩展会在后台异步调用你配置的
DeepSeek API，根据自定义路由标签判断分类，然后把文字、来源链接和保存时间
追加到对应的 Markdown 文件。

主要功能：

- 复制即收集，不改变原有剪贴板行为；
- 自定义分类标签、说明和 Markdown 文件；
- 支持子目录，例如“学习/AI.md”；
- 用户自行配置 DeepSeek API Key 和模型；
- 原始库目录由用户通过系统目录选择器授权；
- 网页内显示处理中、保存成功和失败提示；
- 所有设置和 Markdown 文件保存在用户本机。

本扩展不会持续记录浏览历史。只有用户主动复制文字时，选中文字、网页标题和网址
才会发送到 DeepSeek，用于本次分类。

## 分类

生产力工具

## 图片素材

- 商店图标：`icons/icon128.png`（128×128）
- 功能截图：`store/assets/screenshot-settings-1280x800.png`（1280×800）
- 小型宣传图块：`store/assets/promo-small-440x280.png`（440×280）
- 顶部宣传图块：`store/assets/promo-marquee-1400x560.png`（1400×560）

## 单一用途说明

在用户主动复制网页文字时，使用用户配置的 DeepSeek API 对内容进行分类，
并将其保存到用户授权的本地 Markdown 知识库。

## 权限理由

- `storage`：保存 API Key、模型、路由配置和最近一次保存结果。
- `notifications`：反馈笔记保存成功或失败。
- `api.deepseek.com`：调用 DeepSeek 完成笔记分类。
- `<all_urls>` 内容脚本：在普通网页中监听用户主动触发的复制事件。

## 审核测试步骤

1. 打开扩展设置页。
2. 选择一个本地测试目录并授予写入权限。
3. 填写有效的 DeepSeek API Key。
4. 确认模型名称是该账号可用的模型，并保存。
5. 打开任意普通网页，选中一段文字并按 Ctrl+C。
6. 确认页面右下角先显示“正在分析笔记路由”。
7. 确认随后显示目标 Markdown 文件。
8. 打开授权目录，检查对应 Markdown 文件中的摘录。

## 链接

- 主页：https://github.com/miao1564293969-lang/web-note-router
- 支持：https://github.com/miao1564293969-lang/web-note-router/issues
- 隐私政策：https://miao1564293969-lang.github.io/web-note-router/PRIVACY.html
