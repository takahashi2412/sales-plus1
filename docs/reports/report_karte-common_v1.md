# 作業報告書：カルテ第1版①：共通（report_karte-common_v1）

## 作業用ブランチ名・作業フォルダ
- 作業用ブランチ名：`task/karte-common`
- 作業したワークツリーのフォルダ：`C:\Workspace\apps\sales-plus1-worktrees\karte-common\`

## 計画ファイルを受け取った日と、作業を終えた日
- 計画ファイルを受け取った日：2026-11-09
- 作業を終えた日：2026-11-09

## 変更したファイルの一覧
4章の「触ってよいファイル・フォルダ」の範囲内のみを作成・変更しました。

- `supabase/migrations/20261107000006_karte_common.sql`（新規：退職者の最終所属チーム上席による閲覧拡張、`is_legacy` / `legacy_source_row` の書き込み禁止トリガー、`teams` INSERTポリシー、`audit_logs` トリガー拡張）
- `package.json`（`fixtures:karte:load`・`fixtures:karte:remove`・`fixtures:karte:cleanup-guard` の3スクリプトを追加）
- `fixtures/karte/data.mjs`（新規：カルテの架空データ定義：設定値2件、9〜10月の44営業日KPI推移、9〜10月目標、架空退職メンバー、過去形式のロープレ3件・部下メモ3件）
- `fixtures/karte/load.mjs`（新規：カルテ架空データの投入スクリプト）
- `fixtures/karte/remove.mjs`（新規：カルテ架空データの削除スクリプト）
- `fixtures/karte/cleanup-guard.mjs`（新規：カルテ守りのテストの残り片づけスクリプト）
- `fixtures/foundation/dev-role-plan.mjs`（`leader-admin`：架空チームAのリーダー・管理者権限つきを追加）
- `src/features/home/index.tsx`（新規：ホームの入口・準備中画面、引数なし）
- `src/features/karte/index.tsx`（新規：メンバーカルテの入口・準備中画面、引数なし）
- `src/features/admin/members/index.tsx`（新規：名簿・チームの管理の入口・準備中画面、引数なし）
- `src/features/admin/permissions/index.tsx`（新規：権限の管理の入口・準備中画面、引数なし）
- `src/components/layout/AppLayout.tsx`（左メニューに「ホーム」「メンバーカルテ」「名簿・チームの管理」「権限の管理」を追加し、役割・権限による表示出し分けを実装）
- `src/App.tsx`（4画面のハッシュ切り替え、対象外の画面を直接開いたときの「この画面は使えません」表示、ハッシュが空のときの役割別の初期画面を実装）
- `src/foundation/directory.ts`（退職判定と退職者を一覧の後ろに分ける並び順を実装）
- `src/foundation/DirectoryView.tsx`（退職者に「退職」の印を表示）
- `src/features/kpi/shared/businessDays.ts`（`getYearMonthFromDate` を追加）
- `src/features/kpi/shared/alerts.ts`（月目標の判定で `isInside` を見て `callTarget` / `dealTarget` を使い分けるように修正）
- `src/features/kpi/import/api.ts`（承認時の月目標取得・営業日数計算を取り込みの営業日の月で行うように修正し、取り込み行に `isInside` を含めるように更新）
- `src/features/kpi/import/index.tsx`（承認時のアラート生成に営業日と `isInside` を渡すように更新）
- `src/features/kpi/targets/api.ts`（月目標の保存時に名簿の最新の `is_inside_sales` を取得して入れるように修正）
- `src/features/kpi/targets/index.tsx`（月目標の保存呼び出しを更新）
- `src/features/kpi/alerts/api.ts`（リーダーのチーム一覧を `ended_on is null` の現在の所属のみに絞り込み）
- `src/features/kpi/alerts/index.tsx`（リーダーが自分の担当チームの未対応アラートのみ「対応を記録」ボタンを押せるように修正）
- `tests/foundation/dev-role.test.ts`（`leader-admin` の単体テストを追加）
- `tests/foundation/ui-and-routing.test.ts`（新しい4画面のメニュー出し分けとログイン直後の初期画面の単体テストを追加）
- `tests/foundation/directory.test.ts`（退職者が一覧の後ろに分かれること・退職判定の単体テストを追加）
- `tests/kpi/kpi-shared.test.ts`（`getYearMonthFromDate` と `isInside: true` の月目標アラート判定の単体テストを追加）
- `docs/reports/report_karte-common_v1.md`（本報告書）

## 本人が画面で確かめる手順
1. `npm run dev` を起動し、代表（`ceo`）で `http://localhost:5173`（ハッシュなし）を開くと最初に「ホーム（準備中）」が開き、左メニューに「ホーム」「メンバーカルテ」「権限の管理」が出て、「名簿」を開くと「架空 退職メンバー」が一番下に「退職」の印つきで並ぶことを確かめます。
2. `npm run fixtures:dev-role -- leader-admin` を実行して再読み込みし、左メニューに「ホーム」「メンバーカルテ」「名簿・チームの管理」「権限の管理」がすべて出ることを確かめます。
3. `npm run fixtures:dev-role -- member-a` を実行して `http://localhost:5173`（ハッシュなし）を開き直すと、最初に「名簿」が開き、左メニューに今回の4画面（「ホーム」「メンバーカルテ」「名簿・チームの管理」「権限の管理」）が出ず、`#/home` などを直接開くと「この画面は使えません」が出ることを確かめます。
4. 確認が終わったら、`npm run fixtures:dev-role -- ceo` でテスト代表を元の「代表」に戻します。

### 架空データの出し入れと、守りのテストの残り片づけの使い方
- **架空データを入れるとき**：
  1. 先に土台（`npm run fixtures:load`）→ ロープレ（`npm run fixtures:roleplay:load`）→ KPI（`npm run fixtures:kpi:load`）→ 部下メモ（`npm run fixtures:memo:load`）の順に入れます。
  2. 最後に `npm run fixtures:karte:load` を流します。
- **架空データを消すとき**：
  1. 一番先に `npm run fixtures:karte:remove` を流します。
  2. そのあと部下メモ → KPI → ロープレ → 土台の順に消します。
- **守りのテストが途中で止まって残りを片づけるとき**：
  1. 一番先に `npm run fixtures:karte:cleanup-guard` を流します。
  2. そのあと部下メモ → KPI → ロープレ → 土台の順に `cleanup-guard` を流します。

## やったこと
1. **0章の事前確認**
   - 作業フォルダが `C:\Workspace\apps\sales-plus1-worktrees\karte-common` であること、ブランチが `task/karte-common` で未コミットの変更がないこと、`.env` が存在すること（中身は未閲覧）を確認しました。
   - `npm install` のあと、既存の守りのテスト（`permissions.test.ts`・`roleplay.test.ts`・`kpi-memo.test.ts`）と単体テストを実行し、マイグレーション前の1件を除きすべて通ることを確認しました。
2. **マイグレーションの作成と流し込み（`supabase/migrations/20261107000006_karte_common.sql`）**
   - `private.can_supervisor_see_member` を拡張し、退職した人についても「最後にいたチームの今のリーダー・今の担当MGR」なら `true` を返すようにしました。
   - `private.can_read_subordinate_memo` を更新し、対象者に退職した人がいる場合もその人の最終所属チームの今の上席が読めるようにしました。
   - `roleplay_sessions` に `private.enforce_roleplay_session_rules` トリガーを追加し、ログイン中の利用者による `is_legacy = true` や `legacy_source_row` の書き込み・変更を拒否するようにしました。
   - `teams` に管理者の `INSERT` ポリシーを追加し、`members`・`member_team_history`・`teams`・`mgr_team_assignments`・`permissions` に `private.write_audit_log()` トリガーを設定しました。
   - 本人の許可を得た上で `npm run db:push` を実行し、開発用 Supabase に反映しました。
3. **カルテの架空データと片づけスクリプトの作成（`fixtures/karte/`）**
   - 設定値2件、9〜10月の平日44日分の承認済みKPI推移、9〜10月の月目標、架空退職メンバーとその記録、過去形式（`is_legacy = true`）のロープレ3件・部下メモ3件を投入・削除できるスクリプトを作成し、`load` → `remove` → `load` の入れ直しが動くことを確認しました。
4. **`dev-role` への `leader-admin` 追加（`fixtures/foundation/dev-role-plan.mjs`）**
   - `npm run fixtures:dev-role -- leader-admin` でテスト代表を「架空チームAのリーダー（管理者）」に切り替えられるようにしました（既存の `admin` もそのまま維持）。
5. **左の並び・行き先4画面・初期画面・名簿の退職表示の実装**
   - 左メニューとハッシュルーティングに「ホーム（`#/home`）」「メンバーカルテ（`#/karte`）」「名簿・チームの管理（`#/admin-members`）」「権限の管理（`#/admin-permissions`）」の4画面と、引数なしの準備中コンポーネント4つを作成しました。
   - ハッシュが空のときの初期画面を、リーダー・MGR・代表は「ホーム」、メンバーは「名簿」にしました。
   - 名簿（`DirectoryView`）で退職した人を一覧の後ろに分け、「退職」の印を表示するようにしました。
6. **KPI の前の区切りからの持ち越し4件の修正**
   - 承認時のアラート判定で、今日の月ではなく取り込みの営業日の月の目標と営業日数を使うように直しました。
   - 内勤（`is_inside_sales = true`）の人の月目標アラート判定で、商談数ではなくコール数の目標（`call_target`）を営業日数で割って比べるように直しました。
   - 月目標の保存時に、ログイン時ではなく保存時点の名簿の `is_inside_sales` を読み直して入れるように直しました。
   - リーダーが複数のチームを受け持つとき、自分の担当チームの未対応アラートにだけ「対応を記録」ボタンが出るように直しました。

## 決められずに止めたこと・質問
- ありません（マイグレーション流し込み前の許可確認のみ行い、計画書の仕様どおりにすべて実装・確認できました）。

## テストの結果（通った数／全体）
- **173 / 173 件通過**（テストファイル 12 / 12 件通過）
  - 守りのテスト（土台）`tests/guard/permissions.test.ts`：22 / 22 件通過
  - 守りのテスト（ロープレ）`tests/guard/roleplay.test.ts`：25 / 25 件通過
  - 守りのテスト（KPI・部下メモ）`tests/guard/kpi-memo.test.ts`：27 / 27 件通過
  - 守りのテスト（カルテ）`tests/guard/karte.test.ts`：14 / 14 件通過
  - 土台の単体テスト `tests/foundation/dev-role.test.ts`：9 / 9 件通過
  - 土台の単体テスト `tests/foundation/directory.test.ts`：4 / 4 件通過
  - 画面切り替え・左メニューの単体テスト `tests/foundation/ui-and-routing.test.ts`：5 / 5 件通過
  - KPI共通の単体テスト `tests/kpi/kpi-shared.test.ts`：16 / 16 件通過
  - 部下メモの単体テスト `tests/memo/memo-logic.test.ts`：11 / 11 件通過
  - ロープレ共通の単体テスト `tests/roleplay/shared/viewer.test.ts`：15 / 15 件通過
  - ロープレ記録の単体テスト `tests/roleplay/record/record-logic.test.ts`：17 / 17 件通過
  - トーク・研修の単体テスト `tests/roleplay/talks/talks-and-seminar.test.ts`：8 / 8 件通過
- `npm run build`（型の点検と組み立て）：エラーなく通過

## 守りのテストに触れていないことの確認
- `tests/guard/permissions.test.ts`、`tests/guard/roleplay.test.ts`、`tests/guard/kpi-memo.test.ts`、`tests/guard/karte.test.ts` は変更・削除・スキップを一切行っていません（`git diff main -- tests/guard` が空であることを確認済み）。

## Security Advisor の確認が要るかどうか
- **Security Advisor の確認が要る**（この計画でマイグレーション `20261107000006_karte_common.sql` により関数・トリガー・RLS ポリシーを追加・変更したため、Supabase 管理画面の Security Advisor をご自身のアカウントで開いてご確認をお願いいたします）。

## 0-4 で報告した、読み込んでいたルールファイル
- 自動で読み込んでいたルールファイル（`AGENTS.md`・`GEMINI.md` など）：**なし**

## 気になった点
- なし
