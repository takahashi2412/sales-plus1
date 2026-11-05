# 作業報告書：KPI・部下メモ①：KPIと部下メモの表・権限・架空データ・入口（report_kpi-memo-common_v1）

## 作業用ブランチ名・作業フォルダ
- 作業用ブランチ名：`task/kpi-memo-common`
- 作業したワークツリーのフォルダ：`C:\Workspace\apps\sales-plus1-worktrees\kpi-memo-common\`

## 計画ファイルを受け取った日と、作業を終えた日
- 計画ファイルを受け取った日：2026-11-05
- 作業を終えた日：2026-11-05

## 変更したファイルの一覧
4章の「触ってよいファイル・フォルダ」の範囲内のみを作成・変更しました。

- `supabase/migrations/20261105000005_kpi_memo_schema_and_rls.sql`（新規：KPI・部下メモの8表、private判定関数5つ、RLSポリシー、GRANT、トリガー、監査ログのトリガー）
- `package.json`（`fixtures:kpi:load`・`fixtures:kpi:remove`・`fixtures:kpi:cleanup-guard`・`fixtures:memo:load`・`fixtures:memo:remove`・`fixtures:memo:cleanup-guard` の6スクリプトを追加）
- `fixtures/kpi/data.mjs`（新規：KPIの架空データ定義）
- `fixtures/kpi/load.mjs`（新規：KPI架空データの投入スクリプト）
- `fixtures/kpi/remove.mjs`（新規：KPI架空データの削除スクリプト）
- `fixtures/kpi/cleanup-guard.mjs`（新規：KPI守りのテストの残り片づけスクリプト）
- `fixtures/memo/data.mjs`（新規：部下メモの架空データ定義）
- `fixtures/memo/load.mjs`（新規：部下メモ架空データの投入スクリプト）
- `fixtures/memo/remove.mjs`（新規：部下メモ架空データの削除スクリプト）
- `fixtures/memo/cleanup-guard.mjs`（新規：部下メモ守りのテストの残り片づけスクリプト）
- `fixtures/foundation/dev-role-plan.mjs`（`admin`：架空チームBのメンバー（管理者）を追加）
- `src/foundation/viewer.ts`（新規：ログイン中の人の情報と `isAdmin`・上席判定を土台の共通部品として切り出し）
- `src/features/roleplay/shared/types.ts`（`ViewerContext` を `src/foundation/viewer.ts` から再エクスポート）
- `src/features/roleplay/shared/viewer.ts`（`src/foundation/viewer.ts` から再エクスポート）
- `src/features/kpi/targets/index.tsx`（新規：KPI・目標の入口・準備中画面）
- `src/features/kpi/alerts/index.tsx`（新規：KPIアラートの入口・準備中画面）
- `src/features/kpi/import/index.tsx`（新規：CSV取り込みの入口・準備中画面）
- `src/features/memo/index.tsx`（新規：部下メモの入口・準備中画面）
- `src/components/layout/AppLayout.tsx`（左メニューに「KPI・目標」「KPIアラート」「CSV取り込み」「部下メモ」を追加し、役割・権限による表示出し分けを実装）
- `src/App.tsx`（4画面のハッシュ切り替えと、対象外の画面を直接開いたときの「この画面は使えません」表示を実装）
- `tests/foundation/dev-role.test.ts`（`dev-role` の `admin` 切り替えの単体テストを追加）
- `tests/foundation/ui-and-routing.test.ts`（左メニューの新しい4項目と役割・権限ごとの出し分けの単体テストを追加）
- `tests/roleplay/shared/viewer.test.ts`（`ViewerContext` の `isAdmin` 追加に合わせて期待値を更新）
- `docs/reports/report_kpi-memo-common_v1.md`（本報告書）

## 本人が画面で確かめる手順
1. ターミナルで架空データを投入します（実行済みです。入れ直す場合は `npm run fixtures:load` のあとに `npm run fixtures:kpi:load` と `npm run fixtures:memo:load` を実行します）。
2. `npm run dev` を実行し、ブラウザで `http://localhost:5173` を開いて会社の Microsoft 365 アカウント（`.env` の `DEV_LOGIN_EMAIL`、テスト代表）でログインします。
3. **代表（`ceo`）での確認**：
   - 左メニューに「KPI・目標」（`#/kpi-targets`）、「KPIアラート」（`#/kpi-alerts`）、「部下メモ」（`#/memo`）が表示され、「CSV取り込み」は表示されないことを確かめます。
   - それぞれのメニューを押すと、対応する「準備中」の画面が開くことを確かめます。
   - アドレス欄で直接 `http://localhost:5173/#/kpi-import` を開くと、「この画面は使えません」の案内が出ることを確かめます。
4. **管理者（`admin`）での確認**：
   - ターミナルで `npm run fixtures:dev-role -- admin` を実行し、ブラウザを再読み込みします。
   - 左メニューに「KPI・目標」（`#/kpi-targets`）と「CSV取り込み」（`#/kpi-import`）が表示され、「KPIアラート」と「部下メモ」は表示されないことを確かめます。
   - 「CSV取り込み」を押すと「準備中」の画面が開き、直接 `#/kpi-alerts` や `#/memo` を開くと「この画面は使えません」が出ることを確かめます。
5. **一般メンバー（`member-a`）での確認**：
   - ターミナルで `npm run fixtures:dev-role -- member-a` を実行し、ブラウザを再読み込みします。
   - 新しい4項目のうち左メニューに「KPI・目標」だけが表示され、「KPIアラート」「CSV取り込み」「部下メモ」は表示されないことを確かめます。
6. 確認が終わったら、`npm run fixtures:dev-role -- ceo` でテスト代表を元の「代表」に戻します。

### 架空データの出し入れと、守りのテストの残り片づけの使い方
- **架空データを入れるとき**：
  1. 先に土台の `npm run fixtures:load` を流します。
  2. そのあとに `npm run fixtures:kpi:load` と `npm run fixtures:memo:load` を流します（ロープレも使う場合は `npm run fixtures:roleplay:load` も流します）。
- **架空データを消すとき**：
  1. 先に `npm run fixtures:memo:remove` と `npm run fixtures:kpi:remove`（ロープレも入っている場合は `npm run fixtures:roleplay:remove`）を流します。
  2. 最後に土台の `npm run fixtures:remove` を流します（KPI・部下メモの表が名簿を参照しているため）。
- **守りのテストが途中で止まって残りを片づけるとき**：
  1. 先に `npm run fixtures:memo:cleanup-guard` と `npm run fixtures:kpi:cleanup-guard`（および `npm run fixtures:roleplay:cleanup-guard`）を流します。
  2. 最後に土台の `npm run fixtures:cleanup-guard` を流します。

### `dev-role`（`admin`）の使い方と、`CLAUDE.md` 用の説明
- **使い方**：
  - `npm run fixtures:dev-role -- admin` を実行すると、テスト代表が「架空チームBのメンバー（管理者）」に切り替わり、`permissions` 表に `admin` 権限が付きます。
  - `npm run fixtures:dev-role -- ceo` などほかの指定に切り替えると、`admin` 権限は外れます。
- **マージ後に代表が `CLAUDE.md` のスクリプト表に足せる説明案**：
  - `npm run fixtures:dev-role -- <役割>` の説明欄の末尾に、`admin`（架空チームBのメンバー・管理者権限つき）を指定できる旨を追記できます。
  - また、スクリプト一覧の表に以下の6行を追加できます：
    - `npm run fixtures:kpi:load`：KPIの架空データ（対応表・取り込みの記録・日々のKPI・月の目標・アラート・設定値）を入れる（先に `fixtures:load` が必要）
    - `npm run fixtures:kpi:remove`：KPIの架空データを消す（`fixtures:remove` の前に流す）
    - `npm run fixtures:kpi:cleanup-guard`：KPIの守りのテストが途中で止まったときの残りを片づける（`fixtures:cleanup-guard` の前に流す）
    - `npm run fixtures:memo:load`：部下メモの架空データ（テーマ7つ・種類4つ・部下メモ）を入れる（先に `fixtures:load` が必要）
    - `npm run fixtures:memo:remove`：部下メモの架空データを消す（`fixtures:remove` の前に流す）
    - `npm run fixtures:memo:cleanup-guard`：部下メモの守りのテストが途中で止まったときの残りを片づける（`fixtures:cleanup-guard` の前に流す）

## やったこと
1. **0章の事前確認**
   - 作業フォルダが `C:\Workspace\apps\sales-plus1-worktrees\kpi-memo-common` であること、ブランチが `task/kpi-memo-common` で未コミットの変更がないこと、`.env` が存在すること（中身は未閲覧）を確認しました。
   - `npm install` のあと、既存の守りのテスト（`permissions.test.ts`・`roleplay.test.ts`）と単体テストを実行してすべて通ることを確認しました。
2. **マイグレーションの作成と流し込み（`supabase/migrations/20261105000005_kpi_memo_schema_and_rls.sql`）**
   - KPIの6表（`cti_member_map`・`kpi_imports`・`kpi_daily`・`kpi_targets`・`kpi_target_revisions`・`kpi_alerts`）と部下メモの2表（`subordinate_memos`・`subordinate_memo_targets`）を作成しました。
   - `private` スキーマに5つの判定関数（`can_read_kpi_import`・`is_approver_of_kpi_import`・`can_write_kpi_daily_row`・`can_read_subordinate_memo`・`can_edit_subordinate_memo`）を作成し、`authenticated` と `service_role` に `execute` を付与、`public` と `anon` から外しました。
   - すべての表で RLS をオンにし、既定の権限を外した上で必要な権限のみを `grant`（`authenticated` に `DELETE` は付与しない、`kpi_target_revisions` は `SELECT` のみ）し、仕様どおりの RLS ポリシー・状態遷移トリガー・控え保存トリガー・監査ログ記録トリガー（`cti_member_map`）を設定しました。
   - `npm run db:push -- --dry-run` で確認後、`npm run db:push` で開発用 Supabase に流し込み、`tests/guard/kpi-memo.test.ts`（27件）がすべて通ることを確認しました。
3. **KPI・部下メモの架空データと片づけスクリプトの作成（`fixtures/kpi/`・`fixtures/memo/`）**
   - `fixtures:kpi:load` / `remove` / `cleanup-guard` と `fixtures:memo:load` / `remove` / `cleanup-guard` を作成し、投入・削除・残り片づけが順序どおり正常に動くことを確認しました。
4. **`dev-role` への `admin` 追加（`fixtures/foundation/dev-role-plan.mjs`）**
   - `npm run fixtures:dev-role -- admin` でテスト代表を「架空チームBのメンバー（管理者）」に切り替え、ほかの役割に切り替えたときは `admin` 権限を外すようにしました。
5. **ログイン中の人の情報（`viewer.ts`）の土台への移動と、左メニュー・入口4画面の作成**
   - `ViewerContext`（`isAdmin` を追加）を `src/foundation/viewer.ts` に移し、`src/features/roleplay/shared/` からは再エクスポートして既存のロープレ画面と互換性を保ちました。
   - 左メニューに4項目を追加し、役割・権限に応じた表示の出し分けと、URL直打ち時の「この画面は使えません」表示、および②③が差し替える「準備中」の入口4画面を作成しました。

## 決められずに止めたこと・質問
- ありません（計画書の仕様どおりにすべて実装・確認できました）。

## テストの結果（通った数／全体）
- **129 / 129 件通過**（テストファイル 9 / 9 件通過）
  - 守りのテスト（土台）`tests/guard/permissions.test.ts`：22 / 22 件通過
  - 守りのテスト（ロープレ）`tests/guard/roleplay.test.ts`：25 / 25 件通過
  - 守りのテスト（KPI・部下メモ）`tests/guard/kpi-memo.test.ts`：27 / 27 件通過
  - 土台の単体テスト `tests/foundation/dev-role.test.ts`：8 / 8 件通過
  - 土台の単体テスト `tests/foundation/directory.test.ts`：3 / 3 件通過
  - 画面切り替え・左メニューの単体テスト `tests/foundation/ui-and-routing.test.ts`：4 / 4 件通過
  - ロープレ共通の単体テスト `tests/roleplay/shared/viewer.test.ts`：15 / 15 件通過
  - ロープレ記録の単体テスト `tests/roleplay/record/record-logic.test.ts`：17 / 17 件通過
  - トーク・研修の単体テスト `tests/roleplay/talks/talks-and-seminar.test.ts`：8 / 8 件通過
- `npm run build`（型の点検と組み立て）：エラーなく通過

## 守りのテストに触れていないことの確認
- `tests/guard/permissions.test.ts`、`tests/guard/roleplay.test.ts`、`tests/guard/kpi-memo.test.ts` は変更・削除・スキップを一切行っていません（`git diff main -- tests/guard` が空であることを確認済み）。

## Security Advisor の確認が要るかどうか
- **Security Advisor の確認が要る**（この計画で新しい表8つ・関数・トリガー・RLS ポリシー・GRANT を追加したため、Supabase 管理画面の Security Advisor をご自身のアカウントで開いてご確認をお願いいたします）。

## 0-4 で報告した、読み込んでいたルールファイル
- 自動で読み込んでいたルールファイル（`AGENTS.md`・`GEMINI.md` など）：**なし**

## 気になった点
- なし
