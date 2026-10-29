# Fork 说明 —— html-anything 中文增强版

基于上游 [nexu-io/html-anything](https://github.com/nexu-io/html-anything)（Apache-2.0）的修坑增强 fork。上游是「agentic HTML 编辑器」：让本地已登录的 AI CLI 把随手记直接写成 75 套设计模板的单文件 HTML。本 fork 解决它在国内 Windows 环境的落地问题，并新增免配置桌面版。

## 一、修了什么（上游 Open 坑）

| 上游 Issue | 问题 | 本 fork 修复 |
|---|---|---|
| #158 | 长输出流式 OOM | 采用 PR #159 的 100ms 事件批处理 + 终态优先级（上游已 review 未合并，fork 先用） |
| #145 | Windows 长提示词 argv 截断 | argv-message 协议改走临时文件 `--message-file`；无文件输入的协议 fail-loud，不静默截断 |
| #152 | CDN / Google Fonts 离线半屏 | 双层修复：提示词强制国内系统字体栈；vendor Tailwind Play 本地化，预览与下载路径重写为本地/内联 |
| #160 | 卡片式长图被截断 | `card-xiaohongshu` 模板钉死 `section.slide` 结构，复用 deck 管线逐张导出 ZIP/PDF |

另：merge 上游 PR #139（ZCode adapter，8100+ 行，9 处冲突手工融合）；附带 Antigravity CLI（agy）provider 适配。

## 二、新增：国产大模型直连（cn-direct）

原版依赖 spawn 本机 AI CLI——在国内 Windows 上是脆弱链（CLI 输出长时间不刷新、SSE 无心跳被网关掐断、部分 CLI 大上下文假死）。本 fork 在服务端内置 OpenAI 兼容的 HTTP SSE 直连，**零外部 CLI 依赖**：

- 支持：智谱 GLM、DeepSeek、通义千问、Moonshot（Kimi）
- 15s 心跳保活；三级自动寻钥（界面配置 Key → 环境变量 → `~/.qwen/.env`）
- 设置弹窗内「配置 Key」：粘贴即存本机，模型立即点亮可用，全程零终端命令

### 关键调优：思考型模型的隐形截断

智谱 `glm-5.3-flash` 是强制思考模型（思考不可关）且 `reasoning_effort` 默认最高档——首测 TTFB 239s、总耗时 319s：思维链吃光输出预算，正文 HTML 半途被掐、尾标签缺失，页面坍缩只剩「01」。显式注入参数后实测：

| 指标 | 调优前 | 调优后（实测） |
|---|---|---|
| 首包时间 TTFB | 239.13s | **1.03s** |
| 总生成耗时 | 319.1s | **22.9s**（标准模板）/ 59.16s（8 页 deck 复杂模板） |
| HTML 输出 | 20.1KB 未闭合 | 4.7KB / 15.2KB，严格 `</html>` 闭合 |

对应请求参数（`next/src/lib/agents/cn-direct.ts`）：`thinking:{type:"enabled"}` + `reasoning_effort:"low"` + `max_tokens:16384`。

## 三、新增：Windows 免配置桌面版

- NSIS Setup 安装包（约 145MB），内置 standalone 服务器与本地 Tailwind，**零 Node.js 依赖**
- `.bundle-mtime` 时间戳校验：装新版 Setup 自动覆盖旧缓存，杜绝「装了新包跑老代码」
- 无代码签名：SmartScreen 提示时「更多信息 → 仍要运行」
- 界面收敛：生成按钮固定顶栏（⌘/Ctrl+Enter 全域可用），无悬浮遮挡

下载：GitHub [Releases](../../releases) ｜ 国内镜像：[GitCode 懒人包](https://gitcode.com/Songyike123/html-anything-lazypack)

## 四、已知限制（如实）

- portable 免安装版在临时目录自解压场景不可用，请用 Setup 安装版
- 上游 skills 安装器测试套件在 Windows 有 17 个固有失败（tar/EXDEV/symlink 相关，纯净上游同样失败）；本 fork 全量 372 项实测 355 过，失败项与本 fork 改动无关
- ZCode 槽位依赖本机 ZCode CLI 登录态，属进阶用法，一般用户走直连模型即可

## 五、回馈计划

#152 字体提示词修复、#160 模板 slide 约定、#145 Windows argv 修复三项通用性强，计划整理 PR 回馈上游。

## 致谢

- 上游 [nexu-io/html-anything](https://github.com/nexu-io/html-anything) 及其社区
- PR #159 / PR #139 作者

License：Apache-2.0（沿上游）。
