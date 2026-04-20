<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkable/readme.png" width="500" alt="forkable">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkable/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkable/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

GitHubリポジトリの導入制御を行うためのツール。単なるフォークのラッパーではなく、導入の準備状況を評価し、最適な複製方法を選択し、追跡可能な非同期操作として実行し、結果が実行可能な状態を維持し、時間経過とともに同期を保つためのエンドツーエンドのレイヤーです。

## forkableでできること

GitHubリポジトリをフォークするには、たった一回のクリックで済みます。しかし、フォークするかテンプレートを使うかを選択したり、組織のポリシーに対応したり、非同期での作成を待ったり、アップストリームとの同期を設定したり、結果を実際に実行可能な状態にしたりするには、それなりの作業が必要です。

forkableは、その「それなりの作業」をすべてカバーします。

| レイヤー | 機能 |
|--------------|-----------------------------------------------------------------------------------------------|
| 評価 | リポジトリの導入の準備状況を評価し、フォーク、テンプレート、インポートのいずれが適切かを推奨し、ソース側の修正点を提案します。 |
| 実行 | 複製を追跡可能な非同期操作として作成します。組織/エンタープライズのフォークポリシーに関する問題を事前に検出し、通知します。 |
| 初期設定 | プロファイルに基づいた事後対応：アップストリームとの連携、READMEの更新、変更点の検出、実行可能な状態への移行。 |
| 同期 | GitHubのmerge-upstream APIを呼び出します。差異を正直に報告します。必要に応じて、プルリクエストを使用します。 |
| 一括管理 | フォークの一覧表示、状態確認、一括同期を行います。 |
| 記録 | すべての操作に関する機械可読な記録。ローカルのSQLiteデータベースに監査ログを保存します。 |

## 利用方法

forkableは、**MCPサーバー**（標準入出力経由での通信、Claude CodeなどのMCPクライアント用）と、同じ機能を持つ**CLI**として提供されます。

### MCP

MCPクライアントの設定に追加します。

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

### CLI

```bash
npx @mcptoolshop/forkable assess owner/repo
npx @mcptoolshop/forkable choose-path owner/repo --goal contribute_upstream
npx @mcptoolshop/forkable create-fork owner/repo --destination-org my-org
npx @mcptoolshop/forkable sync my-fork
npx @mcptoolshop/forkable fleet-health
```

すべてのコマンドは、機械可読な出力のために`--json`オプションを受け入れます。

<!-- FORKABLE_COUNTS_START -->
## 22のツール
<!-- FORKABLE_COUNTS_END -->

### 評価
- `forkable_assess`：導入の準備状況のスコア、問題点、利点
- `forkable_choose_path`：フォーク | テンプレート | インポート | 分離クローン
- `forkable_make_forkable`：ソースリポジトリの修正（デフォルト：計画；オプション：プルリクエスト）

### 実行
- `forkable_preflight_policy`：エンタープライズ/組織/リポジトリのフォークポリシーに関する問題点の検出
- `forkable_create_fork`：非同期実行、操作IDを返す
- `forkable_create_from_template`：GitHubの`/generate`を使用
- `forkable_check_operation`：実行中の操作の状態を確認

### 初期設定
- `forkable_bootstrap`：プロファイルに基づいた初期設定（貢献者向け / スターターキット向け / 内部向け / クライアント向け / 実験向け）
- `forkable_configure_upstream`：リモートの設定、オプションの同期ワークフローの設定
- `forkable_scan_drift`：ハードコードされたパス、漏洩した秘密情報、古いCIリファレンスの検出
- `forkable_emit_handoff`：URL、コマンド、注意点、次のアクションを含む、単一の信頼できる成果物

### 同期
- `forkable_sync`：GitHubのmerge-upstream API
- `forkable_diagnose_divergence`：未コミットの変更、リスクのあるファイル、予測される競合
- `forkable_propose_sync_pr`：高速フォワードが失敗した場合のプルリクエストベースの同期

### 一括管理
- `forkable_list_forks`：自分のフォークと監視中のフォークの一覧表示（ヘルス状態の列付き）
- `forkable_fleet_health`：古いフォーク、競合のあるフォーク、放棄されたフォーク
- `forkable_batch_sync`：レート制限を考慮した一括同期

### 記録
- `forkable_receipt`：すべての操作に関する機械可読な記録
- `forkable_audit_log`：追記専用の履歴

## 初期設定プロファイル

| プロファイル | 用途 | 事後対応 |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | アップストリームへのプルリクエスト送信 | アップストリームのリモート、同期ワークフロー、貢献者向けのREADMEセクション、存在しない場合はプルリクエストテンプレート |
| `starter-kit`       | テンプレートから生成し、独自の製品を立ち上げます。 | テンプレート参照を削除、新しいREADMEファイル、新しいLICENSEファイル、.env.exampleファイル。 |
| `internal-seed`     | 社内チーム向けの、共有リポジトリのコピー。 | プレースホルダーを置き換え、社内用のCODEOWNERSを設定、可視性を制限。 |
| `client-delivery`   | 顧客ごとに作成された、成果物用のフォーク。 | 顧客名が付けられたブランチ、履歴のチェック（不要な情報を取り除く）、デフォルトブランチを固定。 |
| `experiment`        | 一時的なコピー / 分離されたコピー。 | アップストリームとの接続を解除、READMEファイルに実験版であることを明記、同期ワークフローは使用しない。 |

## 設定

| 変数。 | 必須。 | デフォルト。 | 備考。 |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | はい。 | —                                            | `repo`, `workflow`, `read:org` の権限。 |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | GHES / ghe.com 用。 |
| `FORKABLE_STATE_DIR` | no       | OSのユーザー状態ディレクトリ（`env-paths`経由）。 | SQLiteの操作と監査データベースが存在する場所。 |

## セキュリティ

脅威モデルと報告ポリシーについては、[SECURITY.md](SECURITY.md) を参照してください。 主なポイント：

- `GITHUB_TOKEN` はログに記録されません。
- すべてのツールの入力は、Zodによって検証されます。
- `make_forkable` はデフォルトで `plan` モードです。 `pr` モードはオプションです。
- フォーク可能なリポジトリは、強制プッシュ、リポジトリの削除、ブランチの削除を行いません。
- テレメトリーは行いません。 設定されたGitHub APIへのアウトバウンド通信のみを行います。

## ステータス

v1.0.0 — 初期のリリース。 [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck) の基準を満たして構築されました。

ゲートの評価基準については、[SHIP_GATE.md](SHIP_GATE.md) を参照してください。

## ライセンス

MIT — [LICENSE](LICENSE) を参照してください。

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
