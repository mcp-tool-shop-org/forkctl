<p align="center">
  <a href="README.ja.md">日本語</a> | <a href="README.md">English</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkable/readme.png" width="500" alt="forkable">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkable/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

GitHub 仓库的采用控制层。它不是一个简单的代码复制工具，而是一个端到端的解决方案，用于评估是否适合采用、选择合适的复制方式、以跟踪的异步操作执行复制，保留可运行的结果，并在一段时间内保持同步，并且——在 v1.1.0 版本中新增的功能——当您准备好将其视为自己的代码时，可以对其进行合理重命名。

## v1.1.0 版本的新功能

第 7 层 —— **具有 AST 意识的多语言重命名功能**。`forkable rename plan` 会生成一个可审查的差异，涵盖身份文件、代码符号（通过 ast-grep 支持 26 种语言）以及非代码文本内容。`forkable rename apply` 会快照当前代码库，运行所有步骤，重新生成锁文件，并为任何二进制文件生成资源重新生成清单。`forkable rename rollback` 会恢复到最新的快照。不使用 `sed` 命令链。能够正确处理单词边界。考虑大小写。

## Forkable 的功能

在 GitHub 上复制一个代码仓库只需点击一次。但要真正“采用”它——选择复制还是模板，处理组织策略，等待异步创建，配置与上游的同步，并确保结果真正可以运行——则需要完成其他所有步骤。

Forkable 负责完成这些“其他所有步骤”。

| 层 | 其作用 |
|--------------|-----------------------------------------------------------------------------------------------|
| 评估 | 评估代码仓库的采用 readiness，推荐复制、模板或导入，并提出上游代码的修复建议。 |
| 执行 | 将代码作为可跟踪的异步操作进行复制。在开始时，会显示与组织/企业复制策略相关的限制。 |
| 初始化 | 基于配置文件的后续操作——配置与上游的连接，更新 README 文件，扫描代码差异，并提供可运行的结果。 |
| 同步 | 调用 GitHub 的合并上游 API。诚实地报告代码差异。如果需要，可以回退到创建拉取请求。 |
| 管理 | 列出、检查健康状况并批量同步您的复制的代码仓库。 |
| 记录 | 机器可读的每项操作记录。本地 SQLite 数据库中的审计日志。 |
| 重命名 | 具有 AST 意识的多语言重命名功能——身份文件、代码符号、文本内容、锁文件重新生成。 |

## 使用场景

Forkable 可以作为 **MCP 服务器**（使用标准输入/输出传输，适用于 Claude Code 和其他 MCP 客户端）和 **命令行工具 (CLI)** 同时提供，两者功能相同。

### MCP

在您的 MCP 客户端配置中添加：

```json
{
  "mcpServers": {
    "forkable": {
      "command": "npx",
      "args": ["-y", "@mcptoolshop/forkable", "mcp"],
      "env": { "GITHUB_TOKEN": "ghp_..." }
    }
  }
}
```

### 命令行工具 (CLI)

```bash
npx @mcptoolshop/forkable assess owner/repo
npx @mcptoolshop/forkable choose-path owner/repo --goal contribute_upstream
npx @mcptoolshop/forkable create-fork owner/repo --destination-org my-org
npx @mcptoolshop/forkable sync my-fork
npx @mcptoolshop/forkable fleet-health
```

所有命令都支持 `--json` 参数，用于生成机器可读的输出。

<!-- FORKABLE_COUNTS_START -->
## 二十二个工具
<!-- FORKABLE_COUNTS_END -->

### 评估
- `forkable_assess` — 评估代码仓库的采用 readiness，显示限制和优势。
- `forkable_choose_path` — 选择复制 | 模板 | 导入 | 独立复制。
- `forkable_make_forkable` — 修复上游代码仓库（默认：计划；可选：创建拉取请求）。

### 执行
- `forkable_preflight_policy` — 检测企业/组织/代码仓库的复制策略限制。
- `forkable_create_fork` — 异步操作，返回操作 ID。
- `forkable_create_from_template` — 使用 GitHub 的 `/generate` 功能。
- `forkable_check_operation` — 检查任何正在进行的操作的状态。

### 初始化
- `forkable_bootstrap` — 基于配置文件的初始化（适用于贡献者/入门套件/内部种子/客户端交付/实验）。
- `forkable_configure_upstream` — 设置远程仓库，配置可选的同步工作流程。
- `forkable_scan_drift` — 扫描复制的代码仓库中的硬编码路径、泄露的密钥和过时的 CI 引用。
- `forkable_emit_handoff` — 提供一个完整的、真实的交付物：URL、命令、注意事项和下一步操作。

### 同步
- `forkable_sync` — GitHub 合并上游 API。
- `forkable_diagnose_divergence` — 显示落后的提交、有风险的文件和预测的冲突。
- `forkable_propose_sync_pr` — 当快速合并失败时，创建基于拉取请求的同步。

### 管理
- `forkable_list_forks` — 列出您拥有的和您正在关注的代码仓库，并显示健康状况。
- `forkable_fleet_health` — 显示过时、冲突或已废弃的代码仓库。
- `forkable_batch_sync` — 批量同步，并考虑速率限制。

### 记录
- `forkable_receipt` — 机器可读的每项操作记录。
- `forkable_audit_log` — 仅追加历史记录。

### 重命名 (第 7 层，v1.1.0 版本新增)
- `forkable_rename_plan` —— 具有 AST 意识的重命名计划器；生成可审查的差异。
- `forkable_rename_apply` —— 快照 + 应用身份信息 + 符号 + 文本内容 + 后续步骤。
- `forkable_rename_rollback` —— 从最新快照恢复。

## 初始化配置文件

| 配置文件 | 用于 | 后续操作 |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | 将代码复制到上游并发送拉取请求 | 上游远程仓库、同步工作流程、贡献者 README 说明、如果不存在则创建拉取请求模板。 |
| `starter-kit`       | 从模板生成，用于启动您自己的产品 | 移除模板引用、创建新的 README 文件、提示创建新的 LICENSE 文件、创建 .env.example 文件。 |
| `internal-seed`     | 内部团队对共享种子代码仓库的复制 | 替换占位符、设置内部 CODEOWNERS、限制可见性。 |
| `client-delivery`   | 为每个客户端创建的交付物复制 | 客户端命名分支、检查已清理的历史记录、锁定默认分支。 |
| `experiment`        | 临时/独立复制。 | 分离上游代码，并在 README 文件中标记为实验项目，不使用同步工作流程。 |

## 配置

| 变量 | 必需 | 默认值 | 备注 |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | 是 | —                                            | `repo`、`workflow`、`read:org` 权限范围 |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | 适用于 GHES / ghe.com |
| `FORKABLE_STATE_DIR` | no       | 操作系统用户状态目录（通过 `env-paths`） | SQLite 数据库和审计数据库的存储位置。 |

## 安全

请参阅 [SECURITY.md](SECURITY.md) 文件，了解安全模型和报告策略。 关键点：

- `GITHUB_TOKEN` 令牌永不记录。
- 所有工具的输入都通过 Zod 进行验证。
- `make_forkable` 默认使用 `plan` 模式。 `pr` 模式需要手动启用。
- Forkable 绝不会强制推送、删除仓库或删除分支。
- 不收集任何遥测数据。 除了配置的 GitHub API 之外，不进行任何外部调用。

## 状态

v1.1.0 版本 —— 添加了第 7 层（重命名）。该版本经过了 [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck) 质量检查。

请参阅 [SHIP_GATE.md](SHIP_GATE.md) 文件，了解评估标准。

## 许可证

MIT — 参见 [LICENSE](LICENSE)。

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
