# SALES +1 作業メモ（NOTES）

作業を再開するときは、このファイル → docs/sales-plus1_handoff_v1.md の順に読む。
作業の区切りで「やったこと／次にやること」を上に追記していく（新しい日付が上）。

## 現在の状況（いつも最新に書き換える）

- フェーズ：企画・設計が完了し、開発の準備に入った段階。コードはまだない
- 確定事項の正本：docs/sales-plus1_handoff_v1.md
- モック：https://claude.ai/artifact/P4LCaBUUUe9KogUY8cBWZ4
- 未決事項：引き継ぎ資料の13章（8項目）。下の「未決事項の進み具合」で管理する

## 未決事項の進み具合

| # | 項目 | 状態 | メモ |
|---|---|---|---|
| 1 | 現行Excelの提供（指標名・時間帯・列構成） | 待ち | ユーザーから提供予定 |
| 2 | 技術構成（DB・認証・ホスティング・AI連携） | 未着手 | 次に検討する |
| 3 | KPI入力の承認フローの要否 | 未着手 | |
| 4 | 日次アラートの初期条件と閾値 | 未着手 | |
| 5 | AI提案の自動化レベルと移行基準 | 未着手 | 推奨は段階方式 |
| 6 | ロープレ評価項目／部下メモ種別タグ | 未着手 | |
| 7 | sales-plus1.web.app の取得確認 | 未着手 | 技術構成が決まってから |
| 8 | 未作成画面のモック（入力・ダッシュボード） | 未着手 | |
| 9 | 開発体制（頭脳＝Claude Code、手＝Antigravity） | 決定 | 2026-10-06 |
| 10 | git方針 | 決定 | 下の「決定事項」参照 |
| 11 | ルールの共有方法（AGENTS.md・GEMINI.md） | 検討中 | 図解：C:\Workspace\visuals\sales-plus1_rule-layers_v1.html |

## 決定事項（引き継ぎ資料にないもの）

### 開発体制（2026-10-06）
- Claude Code：設計、未決事項の決定、作業指示書（docs\tasks\）、レビュー
- Antigravity：実装、動作確認、テスト

### git方針（2026-10-06）
- Git＋GitHub（非公開リポジトリ）を使う。置き場所は既存アプリ（rushup-weekly-report）と同じ takahashi2412（会社用として使用、権限は本人のみ）
- リポジトリ：https://github.com/takahashi2412/sales-plus1.git ／ 本線は main
- コミットの記録名：takahashi2412 ／ k.takahashi@rush-up.co.jp（各PCで git config --global に設定）
- Workspaceの「Gitは未導入」の例外として、このアプリだけGitを使う
- 流れ：① Claude Codeが指示書を書く → ② Antigravityが作業用ブランチで実装・コミット → ③ Claude Codeが差分をレビュー → ④ 本人がOK → ⑤ Claude Codeが本線に取り込み、確認を取ってからpush
- 2台の受け渡しは、このアプリについては push／pull で行う
- メイン機：Git for Windows 2.55.0.5 をインストール済み（2026-10-06、winget）。2台目は未インストール

### ルール共有で気をつけること（検討中の改良案から）
- 読み込みの失敗は警告が出ない → 作業開始時に両ツールに「読み込んでいるルール」を聞く
- 個人ルールは、@読み込みの動作を確かめるまで ~\.claude\CLAUDE.md から消さない
- 守りのテスト（本人版に部下メモを渡さない等）は頭脳側が持ち、Antigravityは変更しない
- Antigravityの報告は docs\reports\ にファイルで残させる
- ファイルごとに担当ツールを決める（同時編集を防ぐ）
- 2台目に渡すものに、ホームフォルダのルールファイルとAntigravityの設定も含める

---

## 2026-10-06（火）メイン機

### やったこと
- Claude.ai での企画・設計の内容を docs/sales-plus1_handoff_v1.md として引き継いだ
- プロジェクトの CLAUDE.md を作成した
- この NOTES.md を作成した
- 開発体制（Claude Code／Antigravity）とgit方針を決めた
- ルールの共有方法を検討し、起こりうるミス・漏れを洗い出した（図解 v1 を作成）

### 次にやること
- 2台目へのGitのインストール（メイン機は済み）
- 最初のpush（リポジトリ作成・git init・.gitignore・初回コミットは済み）
- ルールの共有方法を決め、AGENTS.md・GEMINI.md・CLAUDE.md の下書きを作る（作る前にAntigravityで読み込みを確認）
- 技術構成を決める（未決事項2）
- 現行Excelを受け取ったら、データ設計を詰める（未決事項1）

### もう1台に渡すファイル
- CLAUDE.md
- docs/sales-plus1_handoff_v1.md
- NOTES.md
- C:\Workspace\visuals\sales-plus1_rule-layers_v1.html
