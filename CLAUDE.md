# SALES +1（sales-plus1）

株式会社Rush up 営業部の管理アプリ。日々のKPI（時間帯別）・一般日報・責任者日報・部下メモ・ロープレ・週間教育を1つに統合し、メンバーを「カルテ」で一元把握する。KPIをAIが分析し、改善提案と週次の取り組みを出す。

**作業を始める前に、必ず次の順に読むこと。**
1. `NOTES.md`：現在の状況、引き継ぎ資料より後に決めたこと、次にやること
2. `docs/sales-plus1_handoff_v1.md`：企画・設計の決定事項と未決事項（2026-10-06時点）

引き継ぎ資料と NOTES.md の「決定事項」が食い違うときは、NOTES.md を優先する。

## コミュニケーション

- 日本語で話す
- 抽象論より、構造的・データに基づく説明を優先する
- 確認質問は、クリックで選べる選択式にする（1回に原則1問）
- ユーザーに渡すファイル（資料・Excel等）は、ファイル名末尾のバージョン番号を1つ上げて、最終的に使う名前で出力する（例：_v2 → _v3）

## 命名

- 表示名：SALES +1 ／ スローガン：1DAY +1
- 識別名（URL・リポジトリ・フォルダ・ファイル）：sales-plus1（「+」は使えないため）

## 守ること

- 未決事項（技術構成、KPI指標名など）は勝手に決めず、選択肢を示して確認する
- 社員の実名・人事評価を含むデータはリポジトリやWorkspaceに置かない。サンプルデータのみ
- APIキーは .env に置き、コミットしない
- 数値計算はプログラム、解釈と提案はAI。AIには計算済みの数値だけを渡す
- AI本人版レポートには部下メモ・責任者日報を渡さない（コードで除外し、テストで担保）
- UIは「Rush up 資料デザイン」に準拠（赤は1画面1〜2か所、未達は赤にしない、▲▼を必ず付ける、絵文字なし、影なし）

## 開発体制（頭脳＝Claude Code、手＝Antigravity）

- Claude Code：設計、未決事項の整理と確認、計画ファイルづくり、レビュー、本線への取り込みとpush
- Antigravity：実装、動作確認、テスト
- 2つのツールは順番に使う。同じフォルダで同時に作業させない
- 計画ファイルは `docs/tasks/plan_template.md` をもとに `docs/tasks/plan_内容_v1.md` として作る。Antigravityには `/plan @docs/tasks/plan_内容_v1.md` で渡す
- Antigravity は CLAUDE.md を読まない。守らせたいルール（上の「守ること」と下の「Git」）は、計画ファイルに必ず書く
- Antigravity の作業結果は `docs/reports/` にファイルで残させる
- ファイルの担当：Claude Code＝CLAUDE.md・NOTES.md・docs/（docs/reports/ を除く）・.gitignore・守りのテスト／Antigravity＝アプリのコードとそれ以外のテスト・docs/reports/

## Git（Workspaceの「Gitは使わない」の例外。このアプリはここに従う）

- リポジトリ：https://github.com/takahashi2412/sales-plus1（非公開）／本線：main
- 2台の受け渡しは pull／push で行い、手でコピーしない。作業を始める前に必ず `git pull` する
- Antigravity は作業用ブランチ（例：`task/内容`）で作業し、コミットまで行う。本線への取り込みとpushはしない
- Claude Code は本線との差分をレビューする。守りのテストが変わっていないかを必ず見る
- 本人のOKのあと、Claude Code が本線に取り込む。push は毎回確認を取ってから行う。`--force` は使わない
- Claude Code が書くファイル（docs/・NOTES.md など。docs/reports/ を除く）は、本線に直接コミットしてよい。コミットの前に、本線にいることを `git status` で確かめる
- 作業が終わったら本線（main）に戻す
- .gitignore を緩める変更（Gitに入るファイルを増やす変更）は、確認を取ってから行う
- Claude Code の実行環境からは GitHub のサインイン画面を出せない。サインインは本人のターミナルで行う
