<p align="center">
  <a href="README.md">English</a> | <a href="README.zh.md">中文</a> | <a href="README.es.md">Español</a> | <a href="README.fr.md">Français</a> | <a href="README.hi.md">हिन्दी</a> | <a href="README.it.md">Italiano</a> | <a href="README.pt-BR.md">Português (BR)</a>
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/mcp-tool-shop-org/brand/main/logos/forkctl/readme.png" width="500" alt="forkctl">
</p>

<p align="center">
  <a href="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml"><img src="https://github.com/mcp-tool-shop-org/forkctl/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT"></a>
  <a href="https://mcp-tool-shop-org.github.io/forkctl/"><img src="https://img.shields.io/badge/Landing-Page-2563eb" alt="Landing Page"></a>
</p>

リポジトリの導入を管理するための GitHub。単なるフォークラッパーではなく、導入の準備状況を評価し、適切な複製方法を選択し、追跡可能な非同期操作として実行し、結果をすぐに実行できるようにし、時間経過とともに同期状態を維持する、エンドツーエンドのレイヤーです。さらに、v1.1.0で新しく追加された機能として、必要に応じてリポジトリの名前を適切に変更して、独自のプロジェクトとして利用できるようにします。

## v1.1.0の新機能

レイヤー7 — **ASTを認識する多言語リネーム**。`forkctl rename plan`は、IDファイル、コードシンボル（ast-grep経由で26の言語）、およびコード以外のテキスト形式に対して、レビュー可能な差分を出力します。`forkctl rename apply`はツリーのスナップショットを取得し、すべての処理を実行し、ロックファイルを再生成し、バイナリファイルに対してアセットの再生成マニフェストを作成します。`forkctl rename rollback`は最新のスナップショットを復元します。`sed`チェーンは使用しません。単語境界を考慮して正確に処理し、大文字と小文字を区別します。

## forkctlの機能

GitHubリポジトリのフォークは、ワンクリックで実行できます。リポジトリの導入（フォークとテンプレートの選択、組織ポリシーへの対応、非同期での作成の完了、アップストリームとの同期設定、結果を実際に実行可能にするなど）は、それ以外のすべての作業を指します。

forkctlは、それ以外のすべての作業を管理します。

| レイヤー | 機能 |
|--------------|-----------------------------------------------------------------------------------------------|
| 評価 | リポジトリの導入準備状況を評価し、フォーク、テンプレート、またはインポートのいずれを推奨するかを提案し、ソース側の修正を提案します。 |
| 実行 | 追跡可能な非同期操作としてコピーを作成します。組織/エンタープライズのフォークポリシーの制限事項を事前に提示します。 |
| ブートストラップ | プロファイルに基づいて、その後の処理を実行します。アップストリームとの連携、READMEの更新、ドリフトスキャン、実行可能な状態での引き渡しを行います。 |
| 同期 | GitHubのmerge-upstream APIを呼び出します。乖離を正直に報告します。必要に応じて、プルリクエストにフォールバックします。 |
| フリート | フォークされたリポジトリを一覧表示し、状態を確認し、まとめて同期します。 |
| レシート | すべての操作の機械可読な記録。ローカルのSQLiteに監査ログを保存します。 |
| リネーム | ASTを認識する多言語リネーム。IDファイル、コードシンボル、テキスト形式、ロックファイルの再生成を行います。 |

## 使用例

forkctlは、**MCPサーバー**（stdioトランスポート、Claude Codeおよびその他のMCPクライアント用）と、同じインターフェースを持つ**CLI**の両方として提供されます。

### MCP

MCPクライアントの設定に以下を追加します。

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

すべてのコマンドは、機械可読な出力のために`--json`を受け入れます。

<!-- FORKABLE_COUNTS_START -->
## 22個のツール
<!-- FORKABLE_COUNTS_END -->

### 評価
- `forkctl_assess` — 導入準備状況のスコア、制限事項、強み
- `forkctl_choose_path` — フォーク | テンプレート | インポート | 分離クローン
- `forkctl_make_forkable` — ソースリポジトリを修正（デフォルト：計画、オプション：プルリクエスト）

### 実行
- `forkctl_preflight_policy` — エンタープライズ/組織/リポジトリのフォークポリシーの制限事項を検出
- `forkctl_create_fork` — 非同期、操作IDを返します
- `forkctl_create_from_template` — GitHub `/generate`を使用します
- `forkctl_check_operation` — 実行中の操作をポーリングします

### ブートストラップ
- `forkctl_bootstrap` — プロファイルに基づいて（コントリビューター / スターターキット / 内部シード / クライアント向け / 実験）
- `forkctl_configure_upstream` — リモートを設定し、オプションの同期ワークフローを設定します
- `forkctl_scan_drift` — コピー内のハードコードされたパス、漏洩したシークレット、古いCI参照
- `forkctl_emit_handoff` — 単一の信頼できる成果物：URL、コマンド、注意点、次のアクション

### 同期
- `forkctl_sync` — GitHub merge-upstream API
- `forkctl_diagnose_divergence` — コミットの遅れ、リスクのあるファイル、予測される競合
- `forkctl_propose_sync_pr` — 高速フォワードが失敗した場合の、プルリクエストベースの同期

### フリート
- `forkctl_list_forks` — あなたのリポジトリ + 監視対象、状態の列付き
- `forkctl_fleet_health` — 古い / 競合 / 破棄された
- `forkctl_batch_sync` — 制限付き、レート制限を考慮

### レシート
- `forkctl_receipt` — 任意の操作の機械可読な記録
- `forkctl_audit_log` — 追記専用の履歴

### リネーム（レイヤー7 — v1.1.0で新機能）
- `forkctl_rename_plan` — ASTを認識するリネームプランナー。レビュー可能な差分を出力します。
- `forkctl_rename_apply` — スナップショットを取得し、ID、シンボル、テキスト、および後続の処理を適用します。
- `forkctl_rename_rollback` — 最新のスナップショットから復元します。

## ブートストラッププロファイル

| プロファイル | 目的 | その後の処理 |
|---------------------|--------------------------------------------------------------------|---------------------------------------------------------------------------------|
| `contributor`       | アップストリームにプルリクエストを送信するためのフォーク | アップストリームリモート、同期ワークフロー、コントリビューター向けのREADMEブロック、存在しない場合はプルリクエストテンプレート。 |
| `starter-kit`       | 独自の製品を開始するためのテンプレートから生成 | テンプレート参照を削除し、新しいREADMEを作成し、新しいLICENSEプロンプトを表示し、.env.exampleを作成します。 |
| `internal-seed`     | 共有シードリポジトリの内部チーム用コピー | プレースホルダーを置き換え、内部のCODEOWNERSを設定し、可視性をロックします。 |
| `client-delivery`   | 配信可能なリポジトリのクライアントごとのフォーク | クライアント名付きブランチ、サニタイズされた履歴チェック、ロックされたデフォルトブランチ。 |
| `experiment`        | 使い捨て/分離されたコピー | アップストリームから分離し、READMEに実験としてマークし、同期ワークフローを設定しません。 |

## 設定

| 変数 | 必須 | デフォルト | 備考 |
|----------------------|----------|----------------------------------------------|-------------------------------------------------|
| `GITHUB_TOKEN`       | はい | —                                            | `repo`、`workflow`、`read:org`スコープ |
| `GITHUB_API_URL`     | no       | `https://api.github.com`                     | GHES / ghe.comの場合 |
| `FORKCTL_STATE_DIR` | no       | OSユーザーの状態ディレクトリ（`env-paths`経由） | SQLite操作と監査DBが保存される場所 |

## セキュリティ

脅威モデルと報告ポリシーについては、[SECURITY.md](SECURITY.md)を参照してください。重要な点：

- `GITHUB_TOKEN`はログに記録されません。
- すべてのツールの入力は、Zodによって検証されます。
- `make_forkable`はデフォルトで`plan`モードです。`pr`モードはオプションです。
- forkctlは、強制プッシュ、リポジトリの削除、ブランチの削除を行いません。
- テレメトリはありません。構成されたGitHubAPIを除き、外部への呼び出しはありません。

## ステータス

v2.1.1 — リネームのタイムアウトが、コマンドプロセスツリー全体を終了するようになりました。依存関係のセキュリティアップデート。レイヤー7（リネーム）と、2.1.0の`--brand`モード。 [shipcheck](https://github.com/mcp-tool-shop-org/shipcheck)ゲートに準拠して構築されました。

ゲートのスコアカードについては、[SHIP_GATE.md](SHIP_GATE.md)を参照してください。

## ライセンス

MIT — [LICENSE](LICENSE)を参照してください。

---

<p align="center">
  Built by <a href="https://mcp-tool-shop.github.io/">MCP Tool Shop</a>
</p>
