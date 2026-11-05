# 作業報告書：KPI・部下メモ②：KPIの取り込み・目標・未達の一覧（plan_kpi_v1）

## 1. 作業用ブランチ名・ワークツリーのフォルダ
- 作業用ブランチ：`task/kpi`
- 作業したワークツリーのフォルダ：`C:\Workspace\apps\sales-plus1-worktrees\kpi\`（並列のもう1本：`plan_memo_v1.md`）

## 2. 計画ファイルを受け取った日・作業を終えた日
- 計画ファイルを受け取った日：2026-11-05
- 作業を終えた日：2026-11-05

## 3. 変更・追加したファイルの一覧
すべて計画4章の「触ってよいファイル・フォルダ」（`src/features/kpi/`、`tests/kpi/`、`fixtures/kpi/sample-csv/`、`docs/reports/report_kpi_v1.md`）の範囲内です。

- `src/features/kpi/shared/types.ts`（新規：時間帯14区分・項目・対応表・取り込み記録・目標・アラートの型定義）
- `src/features/kpi/shared/csv.ts`（新規：`TextDecoder('shift_jis')` による Shift_JIS CSV 読み取り、チーム名・対象日抽出、5つの取り込みチェック、所属食い違い警告、同日承認済み重複チェック）
- `src/features/kpi/shared/targets.ts`（新規：営業に出る人・出ない人の月次・日次目標逆算、「総×オ率×ア/オ」アポ数比較、対象日の終わり時点で有効な目標値を `history` から取り出す関数）
- `src/features/kpi/shared/businessDays.ts`（新規：土日と `kpi_holidays` を除いた営業日一覧・経過営業日数・直前の営業日の算出、`kpi_holidays` 未設定検知）
- `src/features/kpi/shared/alerts.ts`（新規：日ごとの未達判定、月のペースの未達と「新しく遅れた日」のみの `needs_response = true` 判定、`target_missing` 判定）
- `src/features/kpi/shared/index.ts`（新規：共通計算部品の再エクスポート）
- `src/features/kpi/import/api.ts`（新規：CSV取り込み・名前の対応・チーム名の対応・承認・未達計算と `alerts` への `.select()` なし `ignoreDuplicates` 書き込み・置きかえ処理）
- `src/features/kpi/import/styles.css`（新規：CSV取り込み・承認画面のスタイル）
- `src/features/kpi/import/index.tsx`（更新：CSV取り込み・承認・対応表管理画面）
- `src/features/kpi/targets/api.ts`（新規：KPIの目標画面のデータ取得・自分の目標の登録／更新）
- `src/features/kpi/targets/styles.css`（新規：KPIの目標画面のスタイル）
- `src/features/kpi/targets/index.tsx`（更新：自分の今月・来月の目標入力と逆算プレビュー、修正履歴表示、上席・管理者向けの目標状態一覧と閲覧画面）
- `src/features/kpi/alerts/api.ts`（新規：未達の一覧のデータ取得・同じチームのリーダーによる対応記録）
- `src/features/kpi/alerts/styles.css`（新規：未達の一覧画面のスタイル）
- `src/features/kpi/alerts/index.tsx`（更新：未対応件数・日付／チーム絞り込み・黒字＋▼＋「未達」表示・「続いている」表示・リーダーの対応記録画面）
- `tests/kpi/kpi-shared.test.ts`（新規：KPI共通計算部品の自動テスト12件）
- `fixtures/kpi/sample-csv/tests/架空チームA(WEB)時間別20261106_20261106.csv`（新規：自動テスト用の正常系 Shift_JIS 架空CSV）
- `fixtures/kpi/sample-csv/tests/架空チームA(WEB)時間別20261105_20261106.csv`（新規：自動テスト用の2日期間 Shift_JIS 架空CSV）
- `fixtures/kpi/sample-csv/tests/異常ヘッダ_架空チームA(WEB)時間別20261106_20261106.csv`（新規：自動テスト用の見出し不一致 Shift_JIS 架空CSV）
- `fixtures/kpi/sample-csv/tests/架空チームA(WEB)時間別20261106_20261106_合計不一致.csv`（新規：自動テスト用の合計不一致 Shift_JIS 架空CSV）
- `fixtures/kpi/sample-csv/架空チームA(WEB)時間別20261106_20261106.csv`（新規：画面確認用の Shift_JIS 架空CSV）
- `fixtures/kpi/sample-csv/架空チームB(WEB)時間別20261106_20261106.csv`（新規：未登録名を含む画面確認用の Shift_JIS 架空CSV）
- `fixtures/kpi/sample-csv/架空チームA(WEB)時間別20261104_20261104.csv`（新規：同日・同チームの取り込み直し確認用の Shift_JIS 架空CSV）
- `docs/reports/report_kpi_v1.md`（新規：本報告書）

## 4. 本人が画面で確かめる手順（並列の2本とも終わってから実施）
1. **管理者でCSV取り込み・承認・取り込み直し**：`npm run fixtures:dev-role -- admin` を流してログインし、左メニュー「CSV取り込み」を開きます。`fixtures/kpi/sample-csv/架空チームA(WEB)時間別20261106_20261106.csv` を選ぶと5つのチェックがすべてOKになり、「④ 取り込む（承認前）」→「⑤ 承認する」を押すと直後に未達が計算・記録されます。続けて `架空チームA(WEB)時間別20261104_20261104.csv` を選ぶと「前の記録を置きかえますか？」の確認が出て、置きかえて承認すると前の記録が「置きかえ済み」になり新しい未達に入れ替わります。
2. **未登録の名前のその場登録**：同じ画面で `架空チームB(WEB)時間別20261106_20261106.csv` を選ぶと、`CTI_新規架空名` が未対応として出るため、その場で名簿の人（または「取り込まない」）に結んで追加するとすぐチェックがOKに変わります。
3. **本人の目標入力・月途中の修正と履歴**：左メニュー「KPIの目標」を開き、今月・来月の目標値を変えると横の表に月次・日次の逆算値（小数第1位まで）がリアルタイムで出ます。今月の目標を更新すると「修正あり」の印がつき、「いつ・どの欄が・前の値→今の値」の履歴が表示されます。上席・管理者は下の表で読める人の今月の目標状態（入力済み／未入力／修正あり）と内容を閲覧できます。
4. **未達の一覧とリーダーの対応記録**：`npm run fixtures:dev-role -- leader` でログインして左メニュー「未達の一覧」を開くと、一番上に未対応の数が出て、未達が黒字＋`▼未達`で並びます。自分のチームのメンバーの要対応行に「対応済」または「不要だった」と理由（必須）を入れて「記録する」を押すと保存されます（`mgr`・`ceo` に切り替えると閲覧のみ、`member` では左メニューに出ず開けません）。

## 5. やったこと
1. **計算の部品（`src/features/kpi/shared/`）とテスト（`tests/kpi/kpi-shared.test.ts`）の先行作成**
   - `TextDecoder('shift_jis')` で Shift_JIS の85列CSV（1行目＝期間、2〜3行目＝時間帯14区分 `0:00〜8:59`〜`21:00〜23:59` × 6項目 `総・実・再・オ・見・ア`、4行目以降＝人、最終行＝`合計`）を読み取る関数を作成しました。
   - 5つの取り込みチェック（①1日分か・ファイル名日付と一致するか、②見出しが一致するか、③対象日時点で有効な `cti_member_map` があるか・`member_id = null` の「取り込まない」行の扱い・有効期間重複のエラー検出、④「取り込まない」行を含む人の行の合計と `合計` 行の一致、⑤同日・同CSVチーム名の既存記録の有無）と、名簿の所属と `cti_team_map` の食い違い警告、同日の他チーム承認済み重複チェックを実装しました。
   - 営業に出る人（`320P ÷ 40P = 8件`、`÷ 80% = 10件`、`÷ 25% = 40件`、`÷ 80% = 50件`）と営業に出ない人（`apo_target`・採用数）の目標逆算を途中丸めなしで実装し、「総×オ率×ア/オから出るアポ数（月次）」との比較判定を入れました。
   - 土日と `kpi_holidays` を除いた営業日の算出（設定値がないときの検知フラグ付き）、日ごとの未達（総が0の休みの日は除外、オが0の日はア/オを除外）、月のペースの未達（新しく遅れた日＝月の最初の営業日または前の営業日時点で遅れていなかったときだけ `needs_response = true`、継続中は `false`）、`history` から対象日の終わり時点の目標値を取り出す処理、`target_missing`（月内の初回承認日のみ `needs_response = true`）を実装し、画面を作る前に12件の自動テストを通してコミットしました。
   - **架空のCSV（Shift_JIS）の作り方と置き場所**：Windows PowerShell 5.1 の `[System.Text.Encoding]::GetEncoding(932)` を使い、波ダッシュには CP932 で文字化けしない全角チルダ（`U+FF5E`＝`0x8160`）を用いて、画面で試す見本3つは `fixtures/kpi/sample-csv/` に、自動テスト用の4つは `fixtures/kpi/sample-csv/tests/` に `.csv` のまま書き出しました（`.gitignore` の `!fixtures/**/*.csv` により `.csv` のまま Git で追跡されます）。
2. **CSV取り込み・承認の画面（`src/features/kpi/import/`）**
   - 複数CSVの同時選択、5つのチェック結果・所属食い違い警告の表示、未対応のCTI名・CSVチーム名のその場登録（`valid_from`＝対象日）、承認前取り込み、置きかえ確認（前の記録を `replaced` → 新しい記録 → `kpi_entries`）、承認と同時に未達を計算して `alerts` へ `.select()` なし・`ignoreDuplicates: true` で書き込み、`import_logs` の `alerts_created_at` と `alert_count` を更新する流れ、「未達を出し直す」ボタン、承認前の取り消し（`replaced`）、および記録一覧・名前の対応一覧・チーム名の対応一覧（`valid_to` の設定による無効化）を作成しました。
3. **KPIの目標の画面（`src/features/kpi/targets/`）**
   - 今月・来月の自分の目標入力、`goes_to_sales` に応じた入力欄の出し分け、月次・日次目標のリアルタイム逆算表示（小数第1位まで）、「総×オ率×ア/オ」アポ数との不一致通知、月途中の修正による「修正あり」と `history` の差分表示（「いつ・どの欄が・前の値→今の値」）、上席・管理者向けの今月の目標状態一覧（入力済み／未入力／修正あり）と閲覧画面を作成しました。
4. **未達の一覧の画面（`src/features/kpi/alerts/`）**
   - 一番上への未対応件数の表示、日付・チームでの絞り込み、日付（新しい順）×人ごとの未達一覧、黒字＋`▼未達`の表示（赤にしない）、月のペースで継続中の行への「続いている」表示と対応欄の非表示、`target_missing` の「目標が未入力」表示、同じチームのリーダーによる「対応済」「不要だった」＋理由（必須）の記録、MGR・代表の閲覧専用表示を作成しました。
5. **レビュー指摘4点の修正（2026-11-05 追記）**
   - **未達の一覧のデータ取得修正**：`src/features/kpi/alerts/api.ts` の `fetchKpiAlertsScreenData` から `import_logs` の読み込みと絞り込みを外し、管理者権限のないリーダー・MGR・代表でもデータベースのRLS（`is_approved_import`）で承認済み取り込み分の `alerts` がそのまま表示されるように直しました。
   - **テスト用CSVの置き場所修正**：`tests/kpi/fixtures/` の `.csv` と `.csv.sjis` を削除し、自動テスト用の Shift_JIS CSV 4つを `fixtures/kpi/sample-csv/tests/` に `.csv` のまま配置して `tests/kpi/kpi-shared.test.ts` から直接読み込むように直しました。
   - **更新0行時のエラー停止**：`submitAlertResponse`、`approvePendingImportAndGenerateAlerts`（`status: 'approved'` 更新）、`cancelPendingImportLog`、`savePendingCsvImport`（`status: 'replaced'` 更新）で `.select('id')` を受け取り、更新行が0行のときは「この操作はできません」として止め（承認0行のときは未達計算に進まない）るようにしました。
   - **月のペースのア/オ比較のコメント整理**：`src/features/kpi/shared/alerts.ts` のア/オ比較コメントを「ア/オは率なので、あるべきを使わず、今月ここまでのア÷オと目標の率をそのまま比べる（2026-11-05 本人の選択）」に書きかえました。

## 6. 決められずに止めたこと・質問
- なし（すべて計画書およびレビュー指摘の記載どおりに実装しました）。

## 7. テストの結果（通った数／全体）
- `npm test`（守りのテストを含む全テスト）：**10ファイル・141テスト中 141テスト通過（失敗 0・スキップ 0）**
  - `tests/foundation/dev-role.test.ts`：8 / 8
  - `tests/foundation/directory.test.ts`：3 / 3
  - `tests/foundation/ui-and-routing.test.ts`：4 / 4
  - `tests/kpi/kpi-shared.test.ts`：12 / 12
  - `tests/roleplay/shared/viewer.test.ts`：15 / 15
  - `tests/roleplay/talks/talks-and-seminar.test.ts`：8 / 8
  - `tests/roleplay/record/record-logic.test.ts`：17 / 17
  - `tests/guard/permissions.test.ts`：22 / 22
  - `tests/guard/roleplay.test.ts`：25 / 25
  - `tests/guard/kpi-memo.test.ts`：27 / 27
- `npm run build`（`tsc -b && vite build`）：エラーなし・通過

## 8. 守りのテストに触れていないことの確認
- `git diff main -- tests/guard` の差分が空であり、`tests/guard/permissions.test.ts`・`tests/guard/roleplay.test.ts`・`tests/guard/kpi-memo.test.ts` を一切変更・削除・スキップしていないことを確認しました。

## 9. Security Advisor の確認が要るかどうか
- 今回の計画（`plan_kpi_v1`）では新しいマイグレーションや表・権限の変更を行っていないため（① `plan_kpi-memo-common_v1` で実施済み）、この計画単体での追加の Security Advisor 確認は不要です。

## 10. 0-4 で報告した、読み込んでいたルールファイル
- なし

## 11. 気になった点
- なし（テスト用CSVの置き場所も `fixtures/kpi/sample-csv/tests/` に整理し、`.csv` のまま追跡できるよう解消しました）。
