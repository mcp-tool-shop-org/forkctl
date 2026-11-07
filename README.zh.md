<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkctl/readme.png" width="500" alt="forkctl">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkctl/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

针对 GitHub 代码仓库的采用控制平面。它不是一个简单的分叉包装器，而是一个端到端的层，用于评估采用的准备情况，选择正确的复制路径，将其作为跟踪的异步操作执行，使结果可运行，并随着时间的推移保持同步，并且——在 v1.1.0 中的新功能——在您准备好将其视为您自己的代码时，对其进行一致的重命名。

## v1.1.0 中的新功能

第 7 层——**感知抽象语法树的多语言重命名**。`forkctl rename plan` 会生成一个可供审核的差异，涵盖身份文件、代码符号（通过 ast-grep 支持 26 种语言）和非代码文本表面。`forkctl rename apply` 会快照整个代码树，运行所有处理步骤，重新生成锁文件，并为任何二进制文件留下一个资产重新生成清单。`forkctl rename rollback` 会恢复最新的快照。没有 `sed` 链。单词边界正确。区分大小写。

## forkctl 的作用

分叉一个 GitHub 代码仓库只需单击一下。采用它——选择分叉还是模板，处理组织策略，等待异步创建，配置上游同步，并使结果真正可运行——才是其他所有操作。

forkctl 负责处理所有其他操作。

| 层 | 它所做的事情 |
|--------------|-----------------------------------------------------------------------------------------------|
| 评估 | 评估代码仓库的采用准备情况，推荐使用分叉、模板或导入，并提出源代码方面的修复建议。 |
| 执行 | 将副本作为跟踪的异步操作创建。提前显示组织/企业分叉策略的限制。 |
| 引导 | 基于配置文件的后续操作——上游配置、README 更新、漂移扫描、可运行的交付。 |
| 同步 | 调用 GitHub 的合并上游 API。如实报告差异。在需要时回退到 PR（拉取请求）。 |
| 舰队 | 列出、检查健康状况并批量同步您的分叉代码仓库。 |
| 记录 | 对任何操作进行的可机器读取的记录。在本地 SQLite 中记录审核日志。 |
| 重命名 | 感知抽象语法树的多语言重命名——身份文件、代码符号、文本表面、锁文件重新生成。 |

## 使用方式

forkctl 同时以 **MCP 服务器**（通过标准输入/输出传输，用于 Claude Code 和其他 MCP 客户端）和具有相同界面的 **CLI** 的形式提供。

### MCP

将其添加到您的 MCP 客户端配置中：

```json
{
  "mcpServers": {
    "forkctl": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/forkctl", "mcp"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

### CLI

```bash
npx @mcptoolshop/forkctl assess owner/repo
npx @mcptoolshop/forkctl choose-path owner/repo --goal contribute_upstream
npx @mcptoolshop/forkctl create-fork owner/repo --destination-org my-org
npx @mcptoolshop/forkctl sync my-fork
npx @mcptoolshop/forkctl fleet-health
```

所有命令都接受 `--json` 作为机器可读输出。

<!-- FORKABLE_COUNTS_START -->
## 二十二个工具
<!-- FORKABLE_COUNTS_END -->

### 评估
- `forkctl_assess` — 采用准备情况评分、限制、优势
- `forkctl_choose_path` — 分叉 | 模板 | 导入 | 分离克隆
- `forkctl_make_forkable` — 修复源代码仓库（默认：计划；可选：PR）

### 执行
- `forkctl_preflight_policy` — 检测企业/组织/代码仓库分叉策略的限制
- `forkctl_create_fork` — 异步，返回 operation_id
- `forkctl_create_from_template` — 使用 GitHub `/generate`
- `forkctl_check_operation` — 轮询任何正在执行的操作

### 引导
- `forkctl_bootstrap` — 基于配置（贡献者 / 启动工具包 / 内部种子 / 客户端交付 / 实验）
- `forkctl_configure_upstream` — 设置远程仓库，可选的同步工作流
- `forkctl_scan_drift` — 副本中的硬编码路径、泄露的密钥、过时的 CI 引用
- `forkctl_emit_handoff` — 单一的真实工件：URL、命令、注意事项、下一步操作

### 同步
- `forkctl_sync` — GitHub 合并上游 API
- `forkctl_diagnose_divergence` — 落后提交数、存在风险的文件、预测的冲突
- `forkctl_propose_sync_pr` — 当快速向前推进失败时，基于 PR 的同步

### 舰队
- `forkctl_list_forks` — 您的 + 已监控，带有健康状况列
- `forkctl_fleet_health` — 过时 / 冲突 / 废弃
- `forkctl_batch_sync` — 受限制、考虑速率限制

### 记录
- `forkctl_receipt` — 对任何操作进行的可机器读取的记录
- `forkctl_audit_log` — 追加模式历史记录

### 重命名（第 7 层——在 v1.1.0 中新增）
- `forkctl_rename_plan` — 感知抽象语法树的重命名规划器；生成可供审核的差异
- `forkctl_rename_apply` — 快照 + 应用身份 + 符号 + 文本 + 后续处理
- `forkctl_rename_rollback` — 从最新的快照中恢复

## 引导配置

| 配置 | 用途 | 后续操作 |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | 分叉以将 PR 发送回上游 | 上游远程仓库、同步工作流、贡献者 README 块、如果不存在则提供 PR 模板 |
| `starter-kit`       | 从模板生成，以启动您自己的产品 | 删除模板引用、提供新的 README、提示提供新的 LICENSE、.env.example |
| `internal-seed`     | 内部团队共享种子代码仓库的副本 | 替换占位符、设置内部 CODEOWNERS、锁定可见性 |
| `client-delivery`   | 针对可交付成果的每个客户端的分叉代码仓库 | 客户端命名的分支、清理历史记录检查、锁定默认分支 |
| `experiment`        | 一次性/分离的副本 | 分离上游，在 README 中标记为实验，没有同步工作流 |

## 配置

| 变量 | 必需 | 默认值 | 说明 |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | 是 | —                                            | `repo`、`workflow`、`read:org` 范围 |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | 对于 GHES / ghe.com |
| `FORKCTL_STATE_DIR` | no       | 操作系统用户状态目录（通过 `env-paths`） | SQLite 操作 + 审核数据库的存储位置 |

## 安全性

请参阅 [SECURITY.md](SECURITY.md)，了解威胁模型和报告策略。要点：

- `GITHUB_TOKEN` 绝不会被记录。
- 所有工具输入都通过 Zod 进行验证。
- `make_forkable` 默认设置为 `plan` 模式。`pr` 模式是可选的。
- forkctl 绝不会强制推送、删除代码仓库或删除分支。
- 没有遥测。除了配置的 GitHub API 之外，没有外部调用。

## 状态

v2.1.1 — 重命名超时现在会结束整个命令进程树；依赖项安全更新。第 7 层（重命名）和 `--brand` 模式，如 2.1.0 中所示。构建到 [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck) 关卡。

请参阅 [SHIP_GATE.md](SHIP_GATE.md) 以获取关卡评分。

## 许可证

MIT — 请参阅 [LICENSE](LICENSE)。

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
