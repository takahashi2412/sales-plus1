# 報告書：カルテ第1版④ 過去の記録の取り込み（`plan_legacy-import_v1`）

- 作業用ブランチ：`task/legacy-import`
- 作業用ワークツリー：`C:\Workspace\apps\sales-plus1-worktrees\legacy-import`
- 計画ファイルを受け取った日：2026-11-09
- 作業を終えた日：2026-11-09
- 対象計画書：`docs/tasks/plan_legacy-import_v1.md`
- 0-4 で報告した読み込んでいたルールファイル：なし（`AGENTS.md`・`GEMINI.md` ともに存在せず）
- Security Advisor の確認：**要る**（`roleplays`・`subordinate_memos`・`seminars` の表・制約・トリガー関数を変更したため、本人が Supabase の管理画面で Security Advisor を開き、確認する）

---

## 1. 本人が画面で確かめる手順（3〜5行）

1. `npm run fixtures:dev-role -- leader` を実行して開発用の役割をリーダー（リーダーA）に切り替え、`npm run dev` で開いた画面にログインする。
2. 左メニューの「カルテ」からメンバーA（またはメンバーB）を選び、タイムラインの2025年4〜6月の履歴に「過去の記録」の印がつき、空のテーマ・種類が「（過去の記録：なし）」と表示されることを確かめる。
3. 「ロープレ」「部下メモ」「研修」の各画面を開き、2025年4〜6月の過去の記録の行に「過去の記録（見るだけ）」と出て、編集・見えなくする・送信・参加者の追加と削除などのボタンが出ず、空の欄が「（過去の記録：なし）」「－」と出ることを確かめる。
4. 確認が終わったら、ターミナルで `npm run fixtures:dev-role -- ceo` を実行して役割を代表（`ceo`）に戻す。

---

## 2. 変更・追加したファイル一覧（すべて計画4章の「触ってよいファイル・フォルダ」の範囲内）

- `supabase/migrations/20261109000007_legacy_records.sql`（新規追加）
- `scripts/legacy-import/core.mjs`（新規追加）
- `scripts/legacy-import/cli.mjs`（新規追加）
- `scripts/legacy-import/fixtures-runner.mjs`（新規追加）
- `package.json`（`scripts` に5行追加のみ）
- `fixtures/legacy/names.csv`（新規追加）
- `fixtures/legacy/clean/01_form_a_team1.csv`（新規追加）
- `fixtures/legacy/clean/02_form_a_team2.csv`（新規追加）
- `fixtures/legacy/clean/03_form_b.csv`（新規追加）
- `fixtures/legacy/clean/04_form_c.csv`（新規追加）
- `fixtures/legacy/errors/01_form_a_errors.csv`（新規追加）
- `fixtures/legacy/errors/02_form_b_errors.csv`（新規追加）
- `fixtures/legacy/errors/03_form_c_errors.csv`（新規追加）
- `fixtures/legacy/errors/bad_names.csv`（新規追加）
- `src/features/karte/shared/calculations.ts`
- `src/features/roleplay/shared/types.ts`
- `src/features/roleplay/record/logic.ts`
- `src/features/roleplay/record/RoleplayRecordView.tsx`
- `src/features/roleplay/record/MemberThemesView.tsx`
- `src/features/roleplay/seminar/logic.ts`
- `src/features/roleplay/seminar/index.tsx`
- `src/features/memo/memo-logic.ts`
- `src/features/memo/index.tsx`
- `tests/legacy-import/legacy-import.test.ts`（新規追加）
- `tests/karte/karte-shared.test.ts`
- `tests/roleplay/record/record-logic.test.ts`
- `tests/roleplay/talks/talks-and-seminar.test.ts`
- `tests/memo/memo-logic.test.ts`
- `docs/reports/report_legacy-import_v1.md`（新規追加）

守りのテスト（`tests/guard/permissions.test.ts`・`tests/guard/roleplay.test.ts`・`tests/guard/kpi-memo.test.ts`・`tests/guard/karte.test.ts`）には一切触れていません。

---

## 3. やったこと

### (1) 表の直し（マイグレーション `20261109000007_legacy_records.sql`）
- `public.roleplays`：`theme_id`・`time_slot` の NOT NULL を外し、`check (is_legacy or (theme_id is not null and time_slot is not null))` を追加。`roleplays_check` を `if exists` なしで外し、`is_legacy` の行は必須チェックから除く形で付け直した。
- `public.subordinate_memos`：`subordinate_memos_check` を `if exists` なしで外し、`is_legacy` の行では `theme_id`・`kind_id` が空でも通る形で付け直した（`noticed` または `guidance` のいずれかが非空である条件は維持）。
- `public.seminars`：`is_legacy boolean not null default false` と `legacy_source jsonb` を追加し、ログインした人による `is_legacy = true`・`legacy_source` の設定や変更を禁止した。
- `roleplays`・`subordinate_memos`（および `subordinate_memo_targets`）・`seminars`（および `seminar_members`）のすべてで、ログインした人（`auth.role() = 'authenticated'`）による過去の記録（`is_legacy = true`）の更新・対象者や参加者の追加変更を禁止し、エラー文に `legacy` を含めた。すべての関数は `private` スキーマに置き、`security definer`・`set search_path = ''` を設定し、`public, anon, authenticated` から実行権を外した。

### (2) 取り込みの道具（`scripts/legacy-import/`）と架空の過去データ（`fixtures/legacy/`）
- 外部ライブラリを使わず、UTF-8 厳密デコード・BOM 除去・クォート内改行とカンマ対応の CSV パーサ・見出し行からの形A／B／C自動判定・日付と時間と〇△×と名前の変換・外して進む行のスキップ・止める理由の一括収集・二重取り込み防止を `scripts/legacy-import/core.mjs` に実装。
- `scripts/legacy-import/cli.mjs` で最初に接続先ホスト名だけを表示し、`import` と `remove` では `--expect-host` と `--yes` を必須化。`members`・`masters`・既存の過去の記録の読み込みは `.range` で1000件ずつ全件取得し、`remove` の `.in()` 削除は100件ずつに分割して実行。
- ターミナルには実名・メール・本文・元ファイル名を一切出さず、`--out` で指定したフォルダのファイル（`legacy-report.json`）にのみ番号とファイル名の対応および「対応表にない名前」の行ごとの元の名前と「上席か対象か」を書き出す形にした。

### (3) 画面の対応
- カルテのタイムライン（`src/features/karte/`）で、過去の部下メモのテーマ・種類が空のときと過去のロープレのテーマが空のときに `（過去の記録：なし）` と表示。
- ロープレの記録・部下メモ・研修の記録の画面で、過去の記録の行に「過去の記録（見るだけ）」の印を出し、編集・見えなくする・送信・下書き保存・参加者の変更ボタンを非表示にし、空の欄を `（過去の記録：なし）`・`－` に統一。

---

## 4. テスト・下見・動作確認の結果

1. **`fixtures:legacy:remove` → `fixtures:legacy:load`（2回）→ `fixtures:legacy:remove` → `fixtures:legacy:load`（1つずつ順番に実行）**
   - 1回目の `fixtures:legacy:remove`：既存の架空過去データ（`subordinate_memos` 15件・`roleplays` 14件・`seminars` 3件）を削除。
   - 1回目の `fixtures:legacy:load`：`接続先ホスト: slsoprchnwyveqekaupf.supabase.co` を表示し、形A 2本・形B 1本・形C 1本を検査（止める理由 0件）して `subordinate_memos` 15件・`roleplays` 14件・`seminars` 3件を新規投入。
   - 2回目の `fixtures:legacy:load`：`subordinate_memos: 新しく入れる 0件（すでに入っている 15件）`、`roleplays: 新しく入れる 0件（すでに入っている 14件）`、`seminars: 新しく入れる 0件（すでに入っている 3件）` となり、重複して入らないことを確認。
   - 2回目の `fixtures:legacy:remove`：15件・14件・3件を削除。
   - 3回目の `fixtures:legacy:load`：再度 15件・14件・3件を新規投入できることを確認。
2. **`fixtures/legacy/errors` の下見（`legacy:preview`）の結果**
   - `npm run legacy:preview -- --names fixtures/legacy/names.csv --dir fixtures/legacy/errors` を実行し、以下の通り止める理由が件数と行番号だけで表示され、個人名・メール・本文・元ファイル名が一切ターミナルに出ず、終了コード 1 で止まることを確認：
     - `ファイル1（形A）: 対象 6行 / 外して進む 0行 / 止める理由 6件`（読めない日付×2、対応表にない名前、上司・実行者・社員・名前が空、部下メモのテーマが一覧にない、上司・実行者が2人以上）
     - `ファイル2（形B）: 対象 2行 / 外して進む 0行 / 止める理由 2件`（内容・方法が振り分けの表にない、上司・実行者・社員・名前が空）
     - `ファイル3（形C）: 対象 3行 / 外して進む 0行 / 止める理由 3件`（内容・方法が振り分けの表にない×3：面談・AP・クローザー）
     - `ファイル4（不明）: 対象 0行 / 外して進む 0行 / 止める理由 1件`（見出しの行が見つからない）
3. **`--expect-host` が違うホスト名のときに `import` と `remove` が止まることの確認**
   - `npm run legacy:import -- --names fixtures/legacy/names.csv --dir fixtures/legacy/clean --expect-host wrong-host.example.test --yes` を実行し、`--expect-host が接続先ホスト名と一致しません（指定: wrong-host.example.test, 接続先: slsoprchnwyveqekaupf.supabase.co）。書き込み・削除を行わずに終了します。` と出て何も書き込まずに終了コード 1 で止まることを確認。
   - `npm run legacy:remove -- --file 01_form_a_team1.csv --expect-host wrong-host.example.test --yes` を実行し、同じく何も消さずに終了コード 1 で止まることを確認。
4. **`npm test` と `npm run build` の結果**
   - `npm test`：**全16ファイル・230テスト成功**（`tests/legacy-import/legacy-import.test.ts` の15テスト、および守りのテスト4ファイルすべてを含む）。
   - `npm run build`：`tsc -b && vite build` がエラーなしで完了。

---

## 5. 途中で止まった原因と、レビューで直したこと

### (1) 初回実行時に止まった原因と修正
- **原因**：土台・部下メモの見本データ投入と `legacy:preview` / `fixtures:legacy:load` を同じターンで同時に呼んだこと、および `fixtures/legacy/` に書いたメールとテーマ名が `fixtures/foundation/data.mjs`・`fixtures/memo/data.mjs` の定義と食い違っていたこと。
- **修正**：メールとテーマ名を土台・部下メモの見本データにそろえ、コマンドは必ず1つずつ順番に実行して前のコマンドが終わってから次を動かすようにした。

### (2) Claude Code のレビューで直したこと（13項目）
1. **`--expect-host` と `--yes` の必須化**：`preview`・`import`・`remove` の最初に接続先ホスト名だけを表示し、`import` と `remove` では `--expect-host` が接続先ホスト名と一致しない（または未指定）場合や `--yes` がない場合に何も書かず・消さずに終了コード 1 で止めるようにした。`package.json` の `fixtures:legacy:load`・`fixtures:legacy:remove` は `scripts/legacy-import/fixtures-runner.mjs` で `.env` の URL からホスト名を読み取って `--expect-host` と `--yes` を渡す形にした（`package.json` にホスト名を直書きしない）。
2. **形A の `kind_id`**：指導内容や今後の指導があっても常に `null` にした（2026-11-09 本人の選択）。
3. **対応表（`names.csv`）の見出し**：計画4章の通り `元の名前,上席か対象か,名簿のメール`（後ろに列追加可）とし、`fixtures/legacy/names.csv` と `fixtures/legacy/errors/bad_names.csv` も同じ見出しに直した。
4. **ロープレ（形B・形C）の `pass_result`**：常に `null` にし、結果・実践結果は `legacy_source` にだけ残すようにした。
5. **形C のロープレの `next_homework` と `note`**：引継ぎ事項を `next_homework` に入れ、`note` は常に `null` にした。
6. **形C の FIX**：`noticed` に詳細を入れ、`guidance` には空でない「引継ぎ事項：…」「実践結果：…」を改行でつないだものを入れるようにした。
7. **形B の内容「営業研修」**：ロープレ（`sales`）に振り分けるようにした。
8. **形C のロープレの内容の振り分け**：形Bと同じ（`アポ`→`apo`、`営業`・`営業研修`→`sales`）だけにし、`AP`・`クローザー` は外して「内容・方法が振り分けの表にない」で止めるようにした。`fixtures/legacy/clean/04_form_c.csv` の `AP` は `アポ`、`クローザー` は `営業研修` に直した。
9. **形B の研修の `theme`**：「`研修：`＋詳細の頭30文字」（詳細が空なら「`研修`」）にした。
10. **1000件の上限と削除の分割**：`members`・`masters`・取り込み済みの過去の記録を読むときは `.range` で1000件ずつ全件読むようにし、`remove` の `.in()` は100件ずつに分けて消すようにした。
11. **形A の「今後の指導」**：指導内容の下に改行して `今後の指導：…` と足す形にした（`【】` は使わない）。
12. **上司・実行者が2人以上**：上司・実行者の欄に2人以上の名前があったら、止める理由「`上司・実行者が2人以上`」にするようにした。
13. **`--out` のファイルの未登録名**：`--out` で書き出すファイル（`legacy-report.json`）に、「対応表にない名前」の行ごとに元の名前と「上席か対象か」を記録し、ターミナルには一切出さないようにした。

---

## 6. 決められずに止めたこと・質問

- なし

---

## 7. 残した課題・気になった点

- **取り込みが途中で失敗したときの扱い**：`legacy:import` でデータベースへの書き込み途中に通信エラーなどで失敗した場合、それまでに書き込まれた一部の行だけが入った状態になる。その場合は `npm run legacy:remove -- --file <ファイル名> --expect-host <ホスト名> --yes` で対象の過去データを一度消してから、もう一度 `legacy:import` で入れ直す運用とする（またはそのまま再実行しても、`legacy_source` の `file`＋`row` で既に入った行は飛ばして残りの行だけを入れられる）。
