# Surge AI Services Availability & Node Monitor Panel (Module)

专为 Surge iOS & macOS 设计的 AI 服务可用性与分流节点监控面板模块，用于实时检测 **ChatGPT (OpenAI)**、**Google Gemini**、**Anthropic Claude** 的可访问性（延迟、地区限制、WAF阻断）及当前实际生效的代理节点与落地机房。

---

## 核心特性

1. **三大主流 AI 连通性与可用性检测**：
   - **ChatGPT**：探测 `chatgpt.com/cdn-cgi/trace` 与前端响应，检测 Cloudflare WAF 403 阻断及 CN/HK 地区受限。
   - **Gemini**：探测 `gemini.google.com` 重定向状态，识别 302 unsupported 地区限制与正常服务状态。
   - **Claude**：探测 `claude.ai/login` 与 trace，识别地区受限（unavailable in your region）及 403 阻断。
2. **多级策略组解包与实际物理节点探测**：
   - 支持多层嵌套策略组（例如 `Claude` -> `Claude-Relay (fallback)` -> `🇺🇸 US-Node-01`）。
   - 自动调用 Surge `$httpAPI` 递归解析出底层实际命中的具体物理节点名称。
3. **真实落地机房显示 (Cloudflare Colo & Geo)**：
   - 附带出口国家/地区代号及边缘数据中心代号（如 `[US·SJC]`、`[US·LAX]`），双重确认未发生 DNS 污染或错误分流。
4. **Surge Module 规范化参数支持**：
   - 使用 `#!arguments` 规范定义参数，用户可在 Surge UI 中直观修改策略组名称、超时时间等，无需手改代码。
5. **极速并发与全局超时保护**：
   - Promise 并发检测，全局 12s 兜底，面板永不卡死。

---

## 面板展示效果预览

```text
┌──────────────────────────────────────────────┐
│ 🤖 AI 服务与节点检测                            │
│ ChatGPT: 🟢 128ms · 🇺🇸 US-Node-01 [US·SJC]   │
│ Gemini : 🟢 95ms · 🇯🇵 JP-Node-02 [JP]         │
│ Claude : 🟢 110ms · 🇸🇬 SG-Node-03 [SG·SIN]   │
└──────────────────────────────────────────────┘
```

- **状态标识**：
  - `🟢 <延迟>ms`：服务完全畅通可用
  - `🟡 地区受限`：节点所在区域不被该 AI 服务官方支持（如 CN/HK）
  - `🔴 阻断(403)`：触发 Cloudflare 质询、WAF 规则或 IP 封锁
  - `⚪️ 超时/网络断开`：网络连接失败或响应超时

---

## 安装与配置方式

### 方式 A：通过 Surge 模块 (Module) 导入（推荐）

1. **直接通过远程 URL 安装**：
   在 Surge 的「模块」界面中选择「从 URL 安装」，粘贴以下链接：
   ```text
   https://raw.githubusercontent.com/flylocus/surge-ai-panel/main/AI-Services-Panel.sgmodule
   ```
2. **或作为本地模块使用**：
   - **macOS**：打开 Surge -> 偏好设置 -> 模块 (Modules) -> 点击“安装新模块”或将 `AI-Services-Panel.sgmodule` 文件拖入。
   - **iOS**：将文件通过 AirDrop 或 iCloud 同步至 Surge 的 `Modules` 文件夹，在“模块”列表中启用。
3. 在模块设置界面中，可按需自定义参数：
   - `CHATGPT_POLICY`：填入当前配置中 ChatGPT 对应的策略组名（如 `AI Suite`，留空则自动模糊匹配）。
   - `GEMINI_POLICY`：填入 Gemini 对应的策略组名（如 `Gemini`，留空则自动匹配）。
   - `CLAUDE_POLICY`：填入 Claude 对应的策略组名（如 `Claude`，留空则自动匹配）。
   - `TIMEOUT`：单项检测超时毫秒数（默认 `5000`）。
   - `SHOW_COLO`：是否显示机房代号 `[US·SJC]`（默认 `true`）。

### 方式 B：直接写入 Surge 配置文件 (.conf)

如需直接集成到主配置（如 `vscode_AI_dler_auto_beta.conf`），在相应段落追加：

```ini
[Panel]
AI-Services = script-name=AI-Services-Panel, title="🤖 AI 服务与节点检测", content="正在检测 ChatGPT, Gemini, Claude...", style=info, update-interval=300

[Script]
AI-Services-Panel = type=generic, timeout=15, script-path=https://raw.githubusercontent.com/flylocus/surge-ai-panel/main/ai-panel.js, argument=chatgpt_policy=AI Suite&gemini_policy=Gemini&claude_policy=Claude&timeout=5000&show_colo=true
```

---

## 文件结构

- `AI-Services-Panel.sgmodule`：Surge 模块定义文件（包含元数据、参数声明、[Panel] 与 [Script] 映射）
- `ai-panel.js`：核心 JavaScript 脚本（处理 HTTP 请求、Trace 解析、递归策略组解包、面板渲染）
- `test-panel.js`：本地逻辑单测套件
