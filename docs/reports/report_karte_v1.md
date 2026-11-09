# 作業報告書：カルテ第1版②：メンバーカルテとリーダー用ホーム（plan_karte_v1）

## 作業用ブランチ名・ワークツリー
- 作業用ブランチ名：`task/karte`
- 作業したワークツリーのフォルダ：`C:\Workspace\apps\sales-plus1-worktrees\karte`

## 計画ファイルを受け取った日と、作業を終えた日
- 計画ファイルを受け取った日：2026-11-09
- 作業を終えた日：2026-11-09

## 変更したファイルの一覧
4章の「触ってよいファイル・フォルダ」（`src/features/karte/`、`src/features/home/`、`tests/karte/`、`tests/home/`、`docs/reports/report_karte_v1.md`）の範囲内のみを変更・追加しました。

- `src/features/karte/shared/types.ts`（新規）
- `src/features/karte/shared/calculations.ts`（新規）
- `src/features/karte/shared/index.ts`（新規）
- `src/features/karte/api.ts`（新規）
- `src/features/karte/styles.css`（新規）
- `src/features/karte/index.tsx`（更新）
- `src/features/home/shared/types.ts`（新規）
- `src/features/home/shared/calculations.ts`（新規）
- `src/features/home/shared/index.ts`（新規）
- `src/features/home/api.ts`（新規）
- `src/features/home/styles.css`（新規）
- `src/features/home/index.tsx`（更新）
- `tests/karte/karte-shared.test.ts`（新規）
- `tests/home/home-shared.test.ts`（新規）
- `docs/reports/report_karte_v1.md`（新規）

## 本人が画面で確かめる手順
※ 並列の作業が2本とも終わってから、以下の手順で確かめてください（切り替えコマンド：`npm run fixtures:dev-role -- 〈leader／leader-admin／mgr／ceo〉`）。

1. `npm run fixtures:dev-role -- leader` を実行して `npm run dev` で開き、まず「ホーム（今日やること）」（`#/home`）で「未対応の未達」「部下メモの確認待ち」「ロープレの知らせ」「トークの確認待ち」の件数が出て、押すと各画面へ移り、各画面の件数と一致することを確かめる。
2. ホーム下部の「メンバーカルテを開く」または左メニューの「メンバーカルテ」（`#/karte`）を開き、架空チームAの「架空メンバー1」を選ぶとアドレスが `#/karte?member=…` になり、7つの部品（1.基本情報と順位 → 2.KPI（基準の日・実績・目標・あるべき・あるべき比▲▼・コール時間と項目別の未達時間数） → 3.約束と見込みの予告枠 → 4.推移のSVG折れ線と指導した日の縦線 → 5.時間帯別の橙強調 → 6.育成の状態 → 7.タイムラインと過去の記録の印・`legacy_source` 表示）が設計書の順に出ることを確かめる。
3. カルテ上部のメンバー選択で「架空退職メンバー（退職）」を選ぶと、一番上に「退職した人の記録です（見るだけ）」と出て、KPI・目標・ロープレの記録・部下メモが見え、順位は出ず、テーマ表と研修の記録には「退職した人は出ません」と出ることを確かめる。
4. `npm run fixtures:dev-role -- leader-admin` に切り替えてホーム（`#/home`）を開き、管理者の権限がある人のみ「CSV取り込み」の項目が追加で出て、`#/kpi-import` の件数と一致することを確かめる（必要に応じて `mgr`・`ceo` でも選べる人の範囲とホーム項目を確かめる）。

## やったこと
1. **カルテ・ホームの純粋計算モジュールと単体テストの作成（Step 1）**
   - `src/features/karte/shared/` に、画面やDBに依存しない純粋関数として以下を実装しました：
     - **選べる人**（`pickSelectableKarteMembers`）：本人を除外し、リーダー＝今の自分のチーム、MGR＝担当チーム、代表＝全員で絞り込み（管理者の権限によるDB全件読み取りに頼らない判定）。退職した人は所属履歴で開始日がいちばん新しい「最後のチーム」の上席・代表が選べるようにし、チーム名順・名前順（退職タグつき）に整列。
     - **基準の日**（`resolveKarteAsOfDate` / `formatKarteAsOfDateLabel`）：その月の承認済みKPIの最新日を返し、ないときは「今月の数字はまだありません」を表示。
     - **KPIの集計と目標・あるべき**（`aggregateKpiForPeriod` / `evaluateKarteKpiTargets`）：今日・今週（月曜始まり〜基準の日）・今月（月初〜基準の日）の総・実・再・オ・見・アの実績合計と率（分母0は「－」）、`resolveTargetValuesAtDate`・`calculateKpiTargets`・`calculateShouldBe` を使った目標・あるべき・あるべき比▲▼の計算、目標未入力時の「目標が未入力」表示に対応。
     - **コール時間と項目ごとの未達の時間数**（`calculateCallHoursAndUnmetSlots`）：営業日のみを対象に、9〜12時台と14〜17時台の8区分（13時台を除く）で、総が `karte_call_hour_threshold`（初期値17）を超えた時間帯数と、総・実・再・オ・見・アの各項目で1時間あたりの目標（途中で丸めない式）を下回った時間帯数を日ごと・期間合計で算出。
     - **時間帯別**（`aggregateByTimeSlot`）：14区分ごとの総・実・実率・アを集計し、総が0でなく月の実率目標を下回る時間帯を「弱い時間帯」として判定。
     - **チームの中の比べ**（`calculateTeamRankings`）：同じチームの現役メンバー内での今月のアポ数順位とアポ達成率（アポ÷基準の日までのあるべきアポ）順位を算出し、目標未入力者は達成率順位から除外、退職者選択時は順位を非表示。
     - **推移・タイムライン**（`buildKarteTrendData` / `buildKarteTimeline`）：2か月分の日ごとのア・総と指導日（ロープレ・部下メモ）の集計、およびロープレ・研修・部下メモの日付降順統合・種類絞り込み・`is_legacy`（「過去の記録」タグ）と `legacy_source` 表示・空項目の安全なフォールバック。
   - `src/features/home/shared/` に、未対応の未達・部下メモの確認待ち（`pickPendingCheckMemos`）・ロープレの知らせ（`buildThemeNoticesSummary`）・トークの確認待ち・CSV取り込み（管理者のみ）を各画面と同じ数え方で集計する `buildHomeSummary` を実装しました。
   - `tests/karte/karte-shared.test.ts`（12テスト）と `tests/home/home-shared.test.ts`（2テスト）を作成し、すべて通過することを確認しました。
2. **メンバーカルテ画面の実装（Step 2）**
   - `src/features/karte/index.tsx`・`api.ts`・`styles.css` を作成し、アドレス `#/karte?member=…` の読み書きと同期、退職者選択時の案内、設定値不足時の「設定値が入っていません」案内、および設計書10章の7つの部品（1.基本情報と順位、2.KPI（9段階＋粗利）、3.約束と見込み、4.推移（SVG折れ線＋指導日の縦線）、5.時間帯別（弱い時間帯を橙強調）、6.育成の状態、7.タイムライン）を順番どおりに実装しました。
3. **リーダー用ホーム画面の実装（Step 3）**
   - `src/features/home/index.tsx`・`api.ts`・`styles.css` を作成し、役割ごとの件数つき項目（0件の項目も表示・押すと対象画面へ遷移）、これからの区切りで出る予告枠、および下部の「メンバーカルテを開く」ランチャーを実装しました。
4. **レビュー指摘2点の修正**
   - **① 管理者でない人への未達・KPI表示の修正**：
     - ホーム（`src/features/home/api.ts`・`src/features/home/shared/`）：`alerts` はDBのRLS（`is_approved_import`）で既に承認済みの取り込み分しか読めないため、`approvedImportIds` による絞り込みを廃止し、読めた `alerts` のうち `needs_response` が真で `response` が空のものを数える形に修正しました。
     - カルテ（`src/features/karte/api.ts`・`src/features/karte/shared/`）：`import_logs` が読めることを前提にせず、「読めた `import_logs` のうち `status` が `approved` でない記録」に入っている `kpi_entries` だけを外す純粋関数 `filterApprovedKpiEntries` を実装しました（管理者でない人は `import_logs` が0件のため何も外さず、管理者は自分の承認前・置きかえ分のKPIだけが外れます）。単体テストも追加しました。
   - **② Supabase 1,000行上限への対応（範囲絞り込み＋`.range()` 分割読み込み）**：
     - `kpi_entries`・`targets` の取得範囲を「選んだ人とその人の今のチームの人（順位用）」かつ「2か月前の月の1日から今日まで」（`resolveScopedMemberIdsForKarteKpi`・`getTwoMonthsAgoFirstDate`）に絞り込み、選んだ人を切り替えたときも必要な範囲を読み込むようにしました。
     - `.range()` で1,000行ずつ分けて1,000行未満になるまで読み続ける共通関数（`fetchAllRowsByRange` / `fetchAllHomeRowsByRange`）を `karte`・`home` に実装し、日々のKPI・目標・取り込み記録・ロープレの記録・テーマ表・研修・部下メモ・未達・トークの読み込みにすべて適用しました。偽のクライアントで2,500行を3回に分けて全件読める単体テストを追加しました。

## 決められずに止めたこと・質問
- なし（計画書初回指定時の `plan_karte-common_v1.md` と `plan_karte_v1.md` の確認のみ0章で実施し、本人の指示どおり `plan_karte_v1.md` を進めました）。

## テストの結果（通った数／全体）
- 単体テスト＋守りのテスト（`npm test`）：**14ファイル／190テスト中 190テスト通過**（失敗 0）
  - 内訳：
    - `tests/karte/karte-shared.test.ts`：14 / 14 通過
    - `tests/home/home-shared.test.ts`：3 / 3 通過
    - 既存の単体テスト（`foundation`・`roleplay`・`kpi`・`memo`）：8ファイル 85 / 85 通過
    - 守りのテスト（`tests/guard/permissions.test.ts`・`roleplay.test.ts`・`kpi-memo.test.ts`・`karte.test.ts`）：4ファイル 88 / 88 通過
- ビルド確認（`npm run build`）：型チェック（`tsc -b`）および本番ビルド（`vite build`）ともにエラーなしで通過

## 守りのテストに触れていないことの確認
- `tests/guard/permissions.test.ts`、`tests/guard/roleplay.test.ts`、`tests/guard/kpi-memo.test.ts`、`tests/guard/karte.test.ts` のいずれも変更・削除・スキップしていません（`git status` で変更がないことを確認済み）。

## Security Advisor の確認が要るかどうか
- この計画（②）では新しいマイグレーションの追加や表・権限（RLS・GRANT）の変更を行っていないため、不要です（①の時点で実施済み）。

## 0-4 で報告した、読み込んでいたルールファイル
- なし（`CLAUDE.md` は手順に従い作業前に読んで確認しました）。

## 気になった点
- なし
