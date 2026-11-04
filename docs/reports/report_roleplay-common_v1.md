# 作業報告書：ロープレ①：土台の追加・ロープレと研修の表・共通の部品（report_roleplay-common_v1）

## 作業用ブランチ名・作業フォルダ
- 作業用ブランチ名：`task/roleplay-common`
- 作業したワークツリーのフォルダ：`C:\Workspace\apps\sales-plus1-worktrees\roleplay-common\`

## 計画ファイルを受け取った日と、作業を終えた日
- 計画ファイルを受け取った日：2026-11-04
- 作業を終えた日：2026-11-04

## 変更したファイルの一覧
4章の「触ってよいファイル・フォルダ」の範囲内のみを作成・変更しました。

- `supabase/config.toml`（`project_id` を `"sales-plus1"` に変更）
- `supabase/migrations/20261104000003_roleplay_common_schema_and_rls.sql`（新規）
- `package.json`（`fixtures:roleplay:load`・`fixtures:roleplay:remove`・`fixtures:roleplay:cleanup-guard` の3スクリプトを追加）
- `fixtures/roleplay/data.mjs`（新規）
- `fixtures/roleplay/load.mjs`（新規）
- `fixtures/roleplay/remove.mjs`（新規）
- `fixtures/roleplay/cleanup-guard.mjs`（新規）
- `src/components/ui/index.tsx`（新規）
- `src/components/layout/AppLayout.tsx`（新規）
- `src/features/roleplay/shared/types.ts`（新規）
- `src/features/roleplay/shared/api.ts`（新規）
- `src/features/roleplay/shared/index.ts`（新規）
- `src/features/roleplay/record/index.tsx`（新規）
- `src/features/roleplay/talks/index.tsx`（新規）
- `src/features/roleplay/seminar/index.tsx`（新規）
- `src/foundation/DirectoryView.tsx`（共通の枠・部品を使って作り直し）
- `src/App.tsx`（画面の枠と `#` ハッシュ切り替えを組み込み）
- `src/index.css`（画面の枠・左メニュー・共通部品のスタイルを追加）
- `tests/foundation/ui-and-routing.test.ts`（新規）
- `docs/reports/report_roleplay-common_v1.md`（本報告書）

## 本人が画面で確かめる手順
1. ターミナルで `npm run fixtures:load` のあと `npm run fixtures:roleplay:load` を実行し（実行済み）、続いて `npm run dev` を実行してブラウザで `http://localhost:5173` を開きます。
2. 「Microsoft 365 でログイン」ボタンを押し、ご自身の会社の Microsoft 365 アカウント（`.env` の `DEV_LOGIN_EMAIL`、テスト代表）でログインします。
3. 上の帯（現在の画面名・ログイン中の名前と役割タグ・ログアウトボタン）と左メニュー（「名簿の確認」「ロープレ」「テーマ表」「トーク一覧」「研修の記録」）が表示され、「名簿の確認」で共通部品（検索欄・役割の選ぶ欄・表・タグ・日付表示・知らせの枠）を使った名簿一覧（7名）が表示されればOKです。
4. 左メニューの「ロープレ」（`#/roleplay`）、「テーマ表」（`#/themes`）、「トーク一覧」（`#/talks`）、「研修の記録」（`#/seminar`）を順に押し、それぞれの画面に切り替わって「準備中」の枠が表示されることを確かめます。

### 架空データの出し入れと、守りのテストの残り片づけの使い方
- **架空データを入れるとき**：先に土台の `npm run fixtures:load` を流してから、`npm run fixtures:roleplay:load` を流します。
- **架空データを消すとき**：先にロープレの `npm run fixtures:roleplay:remove` を流してから、土台の `npm run fixtures:remove` を流します（ロープレの表が名簿を参照しているため）。
- **守りのテストが途中で止まって残りを片づけるとき**：先に `npm run fixtures:roleplay:cleanup-guard` を流してから、土台の `npm run fixtures:cleanup-guard` を流します。

## やったこと
1. **0章の事前確認**
   - 作業フォルダが `C:\Workspace\apps\sales-plus1-worktrees\roleplay-common` であること、ブランチが `task/roleplay-common` で未コミットの変更がないこと、`.env` が存在すること（中身は未閲覧）を確認しました。
   - `npm install` のあと `npx vitest run tests/guard/permissions.test.ts tests/foundation` を実行し、土台のテスト25件がすべて通ることを確認しました。
2. **マイグレーションの作成と流し込み（`supabase/migrations/20261104000003_roleplay_common_schema_and_rls.sql`）**
   - `private.current_member_id()` で退職日（`retired_on`）が今日（`private.today_jst()`）より前の人には `null` を返すように変更し、`private.current_member_role()` も `where m.id = private.current_member_id()` で引くように変更しました。
   - `private` スキーマに6つの判定関数（`current_team_id`・`member_team_now`・`can_supervise_member`・`is_supervisor_of_team`・`is_seminar_participant`・`is_seminar_creator`）を追加し、`authenticated` と `service_role` に `execute` を付与、`public` と `anon` から外しました。
   - 土台の追加3表（`masters`・`settings`・`audit_logs`）とロープレ・研修の6表（`roleplay_themes`・`member_themes`・`roleplays`・`talks`・`seminars`・`seminar_members`）を作成しました。`roleplays` 表の `minutes` と `pass_result` は書きかけ（`submitted_at` が空）の間は空でよく、送るとき（`submitted_at` が空でないとき）は `fixed_point`・`minutes`・`pass_result` の3つを必須とする `check` 制約としました。
   - すべての表で RLS を明示的にオンにし、既定の許可を外してから必要な操作だけを `grant`（`authenticated` には `DELETE` を出さない、`audit_logs` は `select` のみ）し、4章の仕様どおりの RLS ポリシーを設定しました。
   - 監査ログのトリガー関数（`masters`・`settings`・`permissions`）、テーマ表の `kind` 確認トリガー関数、トークの状態遷移と中身変更の確認トリガー関数を作成し、`public, anon, authenticated` から実行許可を外しました。
   - `npm run db:push -- --dry-run` で確認後、`npm run db:push` でデータベースに流し込みました。
3. **架空データと片づけスクリプトの作成（`fixtures/roleplay/`）**
   - `fixtures:roleplay:load`（段階1〜6のテーマ一覧、一覧の3種類、設定値4キー、テーマ表、ロープレの記録、確認待ち・試行中・標準のトーク、研修と参加者、土台の架空メンバー1人への `talk_owner` 権限を投入）、`fixtures:roleplay:remove`、`fixtures:roleplay:cleanup-guard` を作成し、すべて正常に動作することを確かめました。
4. **画面の枠・左メニュー・共通部品・お手本画面の作成**
   - アドレスの `#` で切り替える枠（`src/components/layout/AppLayout.tsx`）と共通部品（`src/components/ui/index.tsx`：ボタン・入力欄・選ぶ欄・表・タグ・知らせの枠・日付表示）、ロープレ共通の型と読み取り部品（`src/features/roleplay/shared/`）、②③の入口ファイル（`src/features/roleplay/record/index.tsx`・`talks/index.tsx`・`seminar/index.tsx`）を作成し、名簿の確認画面（`src/foundation/DirectoryView.tsx`）を共通の枠と部品で作り直しました。
5. **`supabase/config.toml` の修正**
   - `project_id = "foundation"` を `"sales-plus1"` に直しました。

## 決められずに止めたこと・質問
- 初期確認時（0-3）に `.env` が配置されていなかったため一度停止して報告し、配置後に再開しました。
- マイグレーション流し込み前に、ご指示に従って `roleplays` 表の `minutes` と `pass_result` を書きかけ時は空可・送信時は必須（`fixed_point`・`minutes`・`pass_result` の3つを `check` 制約で確認）に修正し、`--dry-run` 確認後に流し込みました。

## テストの結果（通った数／全体）
- **53 / 53 件通過**（テストファイル 4 / 4 件通過）
  - 守りのテスト（土台）`tests/guard/permissions.test.ts`：22 / 22 件通過
  - 守りのテスト（ロープレ）`tests/guard/roleplay.test.ts`：24 / 24 件通過
  - 土台の単体テスト `tests/foundation/directory.test.ts`：3 / 3 件通過
  - 画面切り替え・共通部品の単体テスト `tests/foundation/ui-and-routing.test.ts`：4 / 4 件通過
- `npm run build`（型の点検と組み立て）：エラーなく通過

## 守りのテストに触れていないことの確認
- `tests/guard/permissions.test.ts` および `tests/guard/roleplay.test.ts` は変更・削除・スキップを一切行っていません（`git diff main -- tests/guard` が空であることを確認済み）。

## Security Advisor の確認が要るかどうか
- **Security Advisor の確認が要る**（この計画で新しい表・関数・トリガー・RLS ポリシー・GRANT を追加・変更したため、Supabase 管理画面の Security Advisor をご自身のアカウントで開いてご確認をお願いいたします）。

## 0-4 で報告した、読み込んでいたルールファイル
- 自動で読み込んでいたルールファイル（`AGENTS.md`・`GEMINI.md` など）：**なし**

## 気になった点
- 特にありません。
