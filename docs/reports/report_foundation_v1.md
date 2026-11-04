# 作業報告書：土台（report_foundation_v1）

## 作業用ブランチ名・作業フォルダ
- 作業用ブランチ名：`task/foundation`
- 作業したワークツリーのフォルダ：`C:\Workspace\apps\sales-plus1-worktrees\foundation\`

## 計画ファイルを受け取った日と、作業を終えた日
- 計画ファイルを受け取った日：2026-11-04
- 作業を終えた日：2026-11-04

## 変更したファイルの一覧
4章の「触ってよいファイル・フォルダ」の範囲内のみを作成・変更しました。

- `.env.example`（新規）
- `package.json`（新規）
- `package-lock.json`（新規）
- `tsconfig.json`（新規）
- `tsconfig.app.json`（新規）
- `tsconfig.node.json`（新規）
- `vite.config.ts`（新規）
- `vitest.config.ts`（新規）
- `index.html`（新規）
- `src/vite-env.d.ts`（新規）
- `src/main.tsx`（新規）
- `src/App.tsx`（新規）
- `src/index.css`（新規）
- `src/foundation/types.ts`（新規）
- `src/foundation/supabaseClient.ts`（新規）
- `src/foundation/auth.ts`（新規）
- `src/foundation/directory.ts`（新規）
- `src/foundation/LoginView.tsx`（新規）
- `src/foundation/DirectoryView.tsx`（新規）
- `supabase/config.toml`（`npx supabase init` で生成）
- `supabase/.gitignore`（`npx supabase init` で生成）
- `supabase/push.mjs`（新規）
- `supabase/migrations/20261104000001_foundation_schema_and_rls.sql`（新規）
- `fixtures/foundation/data.mjs`（新規）
- `fixtures/foundation/load.mjs`（新規）
- `fixtures/foundation/remove-ceo.mjs`（新規）
- `fixtures/foundation/remove.mjs`（新規）
- `fixtures/foundation/cleanup-guard.mjs`（新規）
- `tests/foundation/directory.test.ts`（新規）
- `docs/reports/report_foundation_v1.md`（本報告書）

## 本人が画面で確かめる手順

### 1. ログインと名簿一覧の確認（通常時）
1. ターミナルで `npm run fixtures:load` を実行し（実行済み）、続いて `npm run dev` を実行してブラウザで `http://localhost:5173` を開きます。
2. 「Microsoft 365 でログイン」ボタンを押し、ご自身の会社の Microsoft 365 アカウント（`.env` の `DEV_LOGIN_EMAIL`）でログインします。
3. 元の画面に戻り、「自分の情報」に名前「テスト代表」・役割「代表」・今のチーム「全体（所属チームなし）」が表示され、「自分が見られる名簿の一覧」に架空メンバー6名とテスト代表の計7名が表示されればOKです。

### 2. 名簿にない状態の確認と、再作成後の確認
1. 画面右上の「ログアウト」を押し、ターミナルで `npm run fixtures:remove-ceo` を実行して「テスト代表」の行だけを消します。
2. もう一度「Microsoft 365 でログイン」を押し、同じ会社の Microsoft 365 アカウントでログインすると、「名簿に登録されていません。管理者に連絡してください」とだけ表示され、名簿の一覧が一切見えないことを確かめます。
3. 「ログアウト」を押し、ターミナルで `npm run fixtures:load` を実行して「テスト代表」の行を作り直したあと、再度「Microsoft 365 でログイン」を押すと、ログインのたびに動く結び付けの仕組みによって再び「テスト代表」と7名の名簿一覧が表示されることを確かめます。

## やったこと
1. **0章の事前確認**
   - 作業フォルダが `C:\Workspace\apps\sales-plus1-worktrees\foundation` であることを確認しました。
   - `git status` でブランチが `task/foundation` であり、未コミットの変更がないことを確認しました。
   - `.env` ファイルの存在のみを確認しました（中身は開いていません）。
   - Node.js（`v24.22.1`）と npm（`11.19.1`）が入っていることを確認しました。
2. **プロジェクトの土台作成（React + Vite + TypeScript + Vitest + Supabase）**
   - 既存ファイル（`.gitignore`・`CLAUDE.md`・`NOTES.md`・`README.md`・`docs/`・`tests/`）を上書きしないよう設定ファイルを手で作成しました。
   - `vite.config.ts` でポート `5173` と `strictPort: true` を設定しました。
   - `vitest.config.ts` で `environment: 'node'`、`testTimeout: 30000`、`loadEnv(mode, process.cwd(), '')` を設定しました。
   - `tsconfig.app.json`・`tsconfig.node.json` で `tests/guard` を型検査の対象外にしました。
   - `.env.example` に必要な7つの環境変数名だけを記載しました。
3. **データベースの表・ログイン結び付け・RLS・GRANT の作成と流し込み**
   - `npx supabase init` を実行し、`supabase/migrations/20261104000001_foundation_schema_and_rls.sql` に5つの表（`teams`・`members`・`member_affiliations`・`mgr_assignments`・`permissions`）、`private` スキーマの判定関数（`security definer`・`set search_path = ''`・日本時間 `(now() at time zone 'Asia/Tokyo')::date`）、`auth.users` の `last_sign_in_at` 更新時に Microsoft（`azure`）かつメール確認済みの利用者を小文字比較（`lower()`）で `auth_user_id` が空の名簿行に結び付けるトリガー、全表の `enable row level security`、明示的な `GRANT`（`anon` は許可なし、削除は `authenticated` に許可なし）、役割・権限ごとの RLS ポリシーを記述しました。
   - 表と権限はすべて `supabase/migrations/` の SQL ファイルにあり、管理画面だけで作った設定はありません。
   - 先に `npm run db:push -- --dry-run` を実行して流し込む中身を確認しました：
     ```text
     DRY RUN: migrations will *not* be pushed to the database.
     Connecting to remote database...
     Would push these migrations:
      • 20261104000001_foundation_schema_and_rls.sql
     {"upToDate":false,"dryRun":true,"migrations":["20261104000001_foundation_schema_and_rls.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
     ```
   - 中身を確認したうえで `npm run db:push` を実行し、開発用プロジェクトへの流し込みを完了しました。
4. **画面の作成（`src/foundation/`）**
   - Rush up 資料デザイン（絵文字なし・影なし・日本語表記）に従い、Microsoft 365 ログイン画面（`provider: 'azure'`、`scopes: 'email'`、`redirectTo: window.location.origin`）と、ログイン後に「自分の名前・役割・今のチーム」および「自分が見られる名簿の一覧」を表示する画面を作成しました。
   - 名簿にないメールアドレスでログインしたときは「名簿に登録されていません。管理者に連絡してください」とだけ表示し、名簿データを一切表示しないようにしました。
   - `src/` のコードでは `service_role` の鍵や `SUPABASE_DB_URL` を一切使用せず、`VITE_` の付いた名前にもしていません。
5. **架空データの投入・削除スクリプトの作成（`fixtures/foundation/`）**
   - `npm run fixtures:load`（架空の2チーム・6名と、`.env` の `DEV_LOGIN_EMAIL` を使った架空の「テスト代表」（`ceo`）を投入）
   - `npm run fixtures:remove-ceo`（「テスト代表」の行だけを削除）
   - `npm run fixtures:remove`（架空の名簿データをすべて削除）
   - `npm run fixtures:cleanup-guard`（守りのテストが途中で止まった際に `guard` で始まる行と `@example.test` の利用者を片づける補助スクリプト）

## 決められずに止めたこと・質問
- なし（計画ファイルの仕様どおりにすべて実装・確認できました）。

## テストの結果（通った数／全体）
- **25 / 25 件通過**（テストファイル 2 / 2 件通過）
  - 守りのテスト `tests/guard/permissions.test.ts`：22 / 22 件通過
  - 土台の単体テスト `tests/foundation/directory.test.ts`：3 / 3 件通過

## 守りのテストに触れていないことの確認
- `tests/guard/permissions.test.ts` は変更・削除・スキップを一切行っていません（`git diff main -- tests/guard/permissions.test.ts` が空であることを確認済み）。

## Security Advisor の確認が要るかどうか
- **Security Advisor の確認が要る**（この計画で表と権限を作成・変更したため、Supabase 管理画面の Security Advisor をご自身のアカウントで開いてご確認をお願いいたします）。

## 0-4 で報告した、読み込んでいたルールファイル
- 自動で読み込んでいたルールファイル（`AGENTS.md`・`GEMINI.md` など）：**なし**
- （作業の文脈確認のためにリポジトリ内の `CLAUDE.md`・`NOTES.md` を参照しました）

## 気になった点
- `.env` の `SUPABASE_DB_URL` のパスワード部分に URL で特別な意味を持つ記号が含まれている場合でも `supabase db push` が接続文字列の解釈エラー（`DbConfigParseUrlError`）で止まらないよう、`supabase/push.mjs` の中でメモリ上でパスワード部分を URL エンコードして渡す処理を入れています（`.env` ファイル自体は変更せず、値も画面やログには一切出力していません）。
