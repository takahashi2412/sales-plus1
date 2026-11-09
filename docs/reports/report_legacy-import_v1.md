# 報告書：カルテ第1版④ 過去の記録の取り込み（`plan_legacy-import_v1`）

- 作成日：2026-11-09
- ブランチ：`task/legacy-import`
- 対象計画書：`docs/tasks/plan_legacy-import_v1.md`

---

## 1. 作業開始前の5つの確認結果（セクション0）

1. **対象物の確認**：作業フォルダが `C:\Workspace\apps\sales-plus1-worktrees\legacy-import` であることを確認。
2. **Git 状態の確認**：`git status` でブランチが `task/legacy-import` であり、未コミットの変更がないことを確認。
3. **`.env` の有無**：このワークツリー直下に `.env` が存在することを確認（中身は閲覧せず存在のみ確認）。
4. **読み込まれているルールファイル**：`AGENTS.md` / `GEMINI.md` ともに**なし**。
5. **`npm install` と既存テストの確認**：`npm install` 実行後、単体テスト（11ファイル・118テスト）がすべて通ることを確認。

---

## 2. 変更・追加したファイル一覧と実施内容

### (1) データベース・マイグレーション
- `supabase/migrations/20261109000007_legacy_records.sql`（新規追加）
  - `public.roleplays`：`theme_id`・`time_slot` の NOT NULL を外し、`is_legacy or (theme_id is not null and time_slot is not null)` のチェック制約を追加。無名チェック制約 `roleplays_check` を `if exists` なしで落として付け直し、`is_legacy = true` の行を送信時の必須項目チェック（`fixed_point`・`minutes`・`pass_result`）の対象外にした。`private.check_roleplay_write` でログインユーザー（`auth.role() = 'authenticated'`）による `old.is_legacy = true` の更新を禁止（エラー文に `legacy` を含む）。
  - `public.subordinate_memos` / `public.subordinate_memo_targets`：無名チェック制約 `subordinate_memos_check` を `if exists` なしで落として付け直し、`is_legacy = true` のときは `theme_id`・`kind_id` が空でも通るようにした（`noticed` または `guidance` のいずれかが非空である条件は維持）。`private.handle_subordinate_memo_write` で過去のメモの更新を禁止し、`private.check_subordinate_memo_target_write` で過去のメモに対する対象者の追加・更新を禁止。
  - `public.seminars` / `public.seminar_members`：`seminars` に `is_legacy boolean not null default false` と `legacy_source jsonb` を追加。新規トリガー関数 `private.check_seminar_write` でログインユーザーによる `is_legacy = true` / `legacy_source` 付きの追加・変更・過去の研修の更新を禁止し、`private.check_seminar_member_write` で過去の研修に対する参加者の追加・更新を禁止。
  - すべてのトリガー関数は `private` スキーマに置き、`security definer` と `set search_path = ''` を付与し、`public, anon, authenticated` から実行権を剥奪。

### (2) 過去の記録の取り込み道具・コマンド
- `scripts/legacy-import/core.mjs`（新規追加）
  - 外部ライブラリを使わない純粋な計算モジュール（DB 接続なし）。
  - UTF-8 厳密デコード（Shift_JIS 等の不正バイト列を `UTF-8 で読めない` として検出）・先頭 BOM 除去。
  - クォート内改行・カンマ・二重クォート（`""`）対応の自前 CSV パーサ。
  - 見出し行の左端一致による形A（部下メモ）・形B（ロープレ・研修管理表）・形C（指導履歴）の自動判定（形Cの頭2行などの無視、右端の空列や `列1` の許容）。
  - 外して進む4種類の行（中身が空の行、`社員`/`名前` が `テスト` の行、同じファイル内の完全重複行、途中に再度現れる見出し行）のスキップ判定。
  - 日付（`YYYY/M/D`・`YYYY-M-D`・`YYYY年M月D日`・時刻付き・Excel 連続日数 `30000`〜`60000`）、時間（数字・`20分`・`0:15`）、〇△×（`〇`/`○`/`◯` → `o`、`△` → `d`、`×`/`✕`/`x`/`X` → `x`、それ以外は `null`）、名前（`、`・`,`・`・`・`／` 分割、空白と後ろの丸カッコのふりがな除去）の変換。
  - 形A・B・Cから `subordinate_memos`（＋`subordinate_memo_targets`）・`roleplays`・`seminars`（＋`seminar_members`）への振り分けと `is_legacy: true`・`legacy_source: { file, row, values }`・`submitted_at`（当日 `00:00:00+09:00`）の付与。
  - 停止理由の一括収集と、個人情報（実名・メール・本文・元ファイル名）を一切出さないターミナル出力の整形、および `legacy_source` の `file`＋`row`（`roleplays` は `＋member_id`）による二重取り込み防止。
- `scripts/legacy-import/cli.mjs`（新規追加）
  - `preview`（検査と件数表示のみ）・`import`（検査通過後に書き込み）・`remove`（指定フォルダ／ファイル由来の過去の記録の削除）の CLI 実行スクリプト。Supabase エラー時も `code` と `message` のみを出力。
- `package.json`
  - `legacy:preview`、`legacy:import`、`legacy:remove`、`fixtures:legacy:load`、`fixtures:legacy:remove` の5つのスクリプトを追加。

### (3) 架空の昔CSV（`fixtures/legacy/`）
- `fixtures/legacy/names.csv`（新規追加）：`fixtures/foundation/data.mjs` の架空メンバーのメール（`fixture-*@example.test`）への対応表。同じ人の2つの書き方（`メンバーA` と `メンA`）および同姓別人（`架空イトウ` が `上席` ではリーダーA、`対象` ではメンバーB）を含む。
- `fixtures/legacy/clean/`（新規追加）：形A 2ファイル（`01_form_a_team1.csv` UTF-8 BOM つき、`02_form_a_team2.csv`）、形B 1ファイル（`03_form_b.csv`）、形C 1ファイル（`04_form_c.csv` 頭2行の説明行つき）。
- `fixtures/legacy/errors/`（新規追加）：止める理由を一通り確かめるためのエラー確認用 CSV（`01_form_a_errors.csv`、`02_form_b_errors.csv`、`03_form_c_errors.csv`、`bad_names.csv`）。

### (4) 画面の対応（過去の記録の表示・編集不可対応）
- `src/features/karte/shared/calculations.ts`
  - `buildKarteTimeline` で `is_legacy = true` の部下メモのテーマ・種類が空のとき、および過去のロープレのテーマが空のときに `（過去の記録：なし）` と表示するように更新（今の記録の表示は変更なし）。
- `src/features/roleplay/shared/types.ts`、`src/features/roleplay/record/logic.ts`、`src/features/roleplay/record/RoleplayRecordView.tsx`、`src/features/roleplay/record/MemberThemesView.tsx`
  - `RoleplayRow` の `time_slot`・`theme_id` を `string | null` とし、`RoleplayRow` と `SeminarRow` に `is_legacy`・`legacy_source` を追加。
  - ロープレ一覧で `is_legacy === true` の行に「過去の記録（見るだけ）」の印を出し、編集・見えなくするボタンを非表示化。空の `time_slot` を `－`、空の `theme_id` を `（過去の記録：なし）`、空の `pass_result` を `－` と表示。
- `src/features/memo/memo-logic.ts`、`src/features/memo/index.tsx`
  - `is_legacy === true` のメモは自分が `created_by` でも編集不可（閲覧のみ）とし、確認待ち・書きかけ一覧から除外。一覧と詳細に「過去の記録（見るだけ）」の印を出し、編集・送信・下書き保存・見えなくするボタン・対象者チェック変更を出さず、空の `theme_id`・`kind_id` を `（過去の記録：なし）` と表示。
- `src/features/roleplay/seminar/logic.ts`、`src/features/roleplay/seminar/index.tsx`
  - `canEditSeminar` で `isLegacy === true` のときは自分が `created_by` でも `false` を返すように変更。一覧で「過去の記録（見るだけ）」の印を出し、編集・見えなくする・参加者の追加と外すボタンを非表示化。

### (5) 単体テストの追加・更新
- `tests/legacy-import/legacy-import.test.ts`（新規追加）：CSV パーサ、UTF-8 / BOM / 不正バイト列、形A・B・C自動判定、4種類のスキップ行、日付・時間・〇△×・名前分割、3つの表への振り分け、全停止理由の検出、個人情報非表示、二重取り込み防止のテスト（13テスト）。
- `tests/karte/karte-shared.test.ts`、`tests/roleplay/record/record-logic.test.ts`、`tests/roleplay/talks/talks-and-seminar.test.ts`、`tests/memo/memo-logic.test.ts`：`is_legacy = true` の編集不可判定と空欄表示（`（過去の記録：なし）`・`－`）のテストを追加。

---

## 3. 実行結果（マイグレーション・取り込み・取り消し・テスト・ビルド）

1. **`npm run db:push -- --dry-run` / `npm run db:push`**
   - `dry-run` で `20261109000007_legacy_records.sql` のみが対象であることを確認後、`npm run db:push` で適用完了。
2. **`npm run fixtures:legacy:load`（1回目）**
   - 形A 2本・形B 1本・形C 1本を検査（止める理由 0件）し、`subordinate_memos` 15件・`roleplays` 14件・`seminars` 3件を新規投入完了。
3. **`npm run fixtures:legacy:load`（2回目：二重取り込み防止の確認）**
   - `subordinate_memos: 新しく入れる 0件（すでに入っている 15件）`、`roleplays: 新しく入れる 0件（すでに入っている 14件）`、`seminars: 新しく入れる 0件（すでに入っている 3件）` となり、1件も重複投入されないことを確認。
4. **`npm run fixtures:legacy:remove`（取り消しの確認）**
   - `subordinate_memos: 削除 15件`、`roleplays: 削除 14件`、`seminars: 削除 3件` で過去の記録のみが削除されることを確認。
5. **`npm run fixtures:legacy:load`（再投入の確認）**
   - 削除後に再度 `subordinate_memos` 15件・`roleplays` 14件・`seminars` 3件を新規投入できることを確認。
6. **`npm test`（守りのテストを含む全テスト）**
   - **全16ファイル・228テスト成功**（`tests/guard/karte.test.ts` の「取り込んだ過去の記録は、だれも直せない・消せない（2026-11-09。管理者でも）」を含む）。
7. **`npm run build`**
   - `tsc -b && vite build` がエラーなしで完了。

---

## 4. 途中で止まった原因と修正内容

1. **マイグレーション内の退職者チェック条件の修正（Claude Code レビュー指摘）**
   - **原因**：`20261109000007_legacy_records.sql` で `check_roleplay_write`・`check_subordinate_memo_target_write`・`check_seminar_member_write` を書き直した際、退職者のチェックが `20261107000006_karte_common.sql` の `private.is_retired_member(new.member_id)` ではなく `retired_on < date` の比較になっており、計画①の制約を弱めてしまっていた。
   - **修正**：退職者のチェック条件とエラー文言を `20261107000006_karte_common.sql` と完全に同じ形（`private.is_retired_member(new.member_id)` を使用し、INSERT 時・`member_id` 変更時・`removed_at` を空に戻す時に検査する形）に戻した上で、`auth.role() = 'authenticated'` のときのみ過去の記録・退職者チェックを止める形に統一した。
2. **`legacy:preview` / `fixtures:legacy:load` 初回実行時の停止（同時実行と架空データの食い違い）**
   - **原因**：
     1. 土台・部下メモの見本データ投入（`fixtures:load` / `fixtures:memo:load`）と `legacy:preview` / `fixtures:legacy:load` を同じターンで同時に呼んだため、土台データの投入完了前に検査が走った。
     2. `fixtures/legacy/names.csv` と `fixtures/legacy/clean/` に書いたメール・テーマ名が、`fixtures/foundation/data.mjs`（`fixture-leader-a@example.test` など）および `fixtures/memo/data.mjs`（`アポ`・`リスト`・`営業`・`管理`・`採用`・`姿勢`・`その他`）の定義と食い違っていたため、事前チェックで「対応表のメールが名簿にない」「部下メモのテーマが一覧にない」として停止した。
   - **修正**：
     1. `fixtures/legacy/names.csv` と `fixtures/legacy/clean/`・`errors/` のメールとテーマ名を `fixtures/foundation/data.mjs`・`fixtures/memo/data.mjs` の定義に完全にそろえ、`cli.mjs` の接続先環境変数も `SUPABASE_URL || VITE_SUPABASE_URL` に対応させた。
     2. コマンドは1つずつ順番に実行し、前のコマンドの完了を確認してから次のコマンドを実行する手順で通し直した。

---

## 5. 残した課題・気づいたこと

- なし（すべての要件・守りのテスト・単体テスト・ビルドを通過済み）。
