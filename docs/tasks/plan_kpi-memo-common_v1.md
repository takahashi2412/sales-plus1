# 計画：KPI・部下メモ①：KPIと部下メモの表・権限・架空データ・入口（plan_kpi-memo-common_v1）

作成日：2026-11-05 ／ 作成：Claude Code ／ 作業：Antigravity
作業用ブランチ：task/kpi-memo-common
並列：なし（この計画が本線に入ってから、②plan_kpi_v1 と③plan_memo_v1 を2本の並列で始める）
作業するフォルダ：C:\Workspace\apps\sales-plus1-worktrees\kpi-memo-common\（Claude Code が用意した、この計画専用の作業用フォルダ（ワークツリー）。作業用ブランチもできている）

> この計画に書いていないことは、進めずに質問してください。

## 0. 最初に必ずやること
1. 今開いているフォルダが、上の「作業するフォルダ」であることを確かめる。違っていたら、作業を始めずに報告する（元のフォルダ C:\Workspace\apps\sales-plus1 では作業しない）
2. `git status` で、作業用ブランチ `task/kpi-memo-common` にいること、変更が残っていないことを確かめる。違っていたら、作業を始めずに報告する。ブランチは作らない・切り替えない（Claude Code が最新の本線から作ってある）
3. `.env` があるかどうかだけを確かめる（中身は開かない・表示しない）。なければ止めて報告する
4. 今読み込んでいるルールファイル（AGENTS.md・GEMINI.md など）をすべて挙げて報告する。なければ「なし」と報告する
5. `npm install` をしてから `npx vitest run tests/guard/permissions.test.ts tests/guard/roleplay.test.ts tests/foundation tests/roleplay` を回し、土台とロープレの守りのテストと、画面・計算のテストがすべて通ることを確かめる（通らなければ、作業を始めずに報告する）。`tests/guard/kpi-memo.test.ts` は、この計画で作る表がまだないので、始める前は落ちてよい（作り終えたら通す）
6. ログインの回数の上限：守りのテストは、1回でテスト用の人が 26 回ログインする（土台9・ロープレ10・KPIと部下メモ7）。開発用の Supabase は、ログインが5分に30回までのことがある。テストで 429（回数の上限のエラー）や「rate limit」が出たら、5分待ってから回す。守りのテストを続けて何度も回さない（直したあとにまとめて1回。KPIと部下メモだけを確かめるときは `npx vitest run tests/guard/kpi-memo.test.ts`）
7. テストは、外につながる形で回す（開発用の Supabase に届かない囲いの中で回すと「fetch failed」になる）

## 1. 目的（なぜやるか）
KPI・部下メモの区切りの先頭で、2本の並列（②KPIの画面、③部下メモの画面）がぶつからないように、表・権限・架空データ・左メニューと入口・見る人の情報の部品を、先に1本で作る。KPIは「承認前の数字は取り込んだ管理者だけ」「取り込み直しても前の数字を消さない」、部下メモは「本人に見せない」「同じチームの人だけ」を、データベースの段階で守る。

## 2. やること
1. 新しいマイグレーションのファイルを `supabase/migrations/` に足す（番号は `20261104000004` より後。例：`20261105000005_kpi_memo_schema_and_rls.sql`。流し込み済みのファイルは直さない）
   - 4章の表をすべて作る。すべてに RLS をオンにし、土台と同じく、まず `revoke all on table … from public, anon, authenticated` で既定の許可を外してから、必要な操作だけを `grant` する
   - `masters` の `kind` の決まり（check）に、`memo_theme`（部下メモのテーマ）と `memo_kind`（部下メモの種類）を足す（今の3つ `scene`・`industry`・`list_type` は残す）
   - 判定の関数を足す（`private` のスキーマ。`security definer`・`set search_path = ''`・`authenticated` と `service_role` に `execute`、`anon` と `public` から外す。土台の関数と同じ作り。名前はこのとおりにする）
     - `private.is_approved_import(log uuid)`：その取り込みの記録の `status` が `approved`
     - `private.is_my_pending_import(log uuid)`：`private.is_admin()` が真で、その取り込みの記録の `status` が `pending`、`imported_by` がログインしている人
     - `private.is_my_approved_import(log uuid)`：`private.is_admin()` が真で、その取り込みの記録の `status` が `approved`、`imported_by` がログインしている人
     - `private.is_memo_writer(memo uuid)`：その部下メモの `created_by` がログインしている人
     - `private.can_read_memo(memo uuid)`：書いた人なら真（書きかけ・見えなくしたものも）。ほかの人は、送ってあり（`submitted_at` あり）・見えなくしていない（`hidden_at` が空）メモのうち、①対象者（`removed_at` が空の行）に自分が入っておらず、②対象者（`removed_at` が空の行）のだれかについて `private.can_supervise_member(対象者)` が真のとき
     - 取り込みの記録の関数は、`kpi_entries`・`alerts` の決まり（ポリシー）から `import_logs` を読むために使う（`import_logs` は管理者しか読めないので、ポリシーの中で直接 select しない）。部下メモの2つの関数は、`subordinate_memos` と `subordinate_memo_targets` の決まりがおたがいの表を直接参照して、無限に参照が続くエラー（infinite recursion）にならないように使う
   - トリガー（関数は `private` に置き、`security definer`・`set search_path = ''`。土台の `handle_auth_user_login` と同じく `revoke all on function … from public, anon, authenticated`）。どれも、管理用の鍵（`(select auth.role()) = 'service_role'`）のときは素通しにする（ロープレの `check_talk_update` と同じ）
     - `import_logs` の変更の確かめ（4章「取り込みの記録の状態」）
     - `kpi_entries` の追加：`date` を、その取り込みの記録の `target_date` にする（画面から送られた値は使わない）
     - `kpi_targets` の追加と変更（4章「月の目標」）
     - `alerts` の対応の記録（4章「アラート」）
     - `subordinate_memos` の一覧の種類と送るときの確かめ、`subordinate_memo_targets` の対象者の確かめ（4章「部下メモ」）
   - 監査ログ：`cti_member_map`・`cti_team_map` の追加・変更・削除を、ロープレ①の `private.record_audit_log` のトリガーで `audit_logs` に残す（書き方はロープレ①と同じ。`row_id` は `id::text`）
2. 架空データを置く（`node --env-file=.env` で動かす。架空の名前だけ）
   - `fixtures/kpi/`：`package.json` の scripts に `fixtures:kpi:load`・`fixtures:kpi:remove`・`fixtures:kpi:cleanup-guard` を足す。入れるもの：CSVのチーム名の対応（架空チームA・B。例：`架空チームA(WEB)`）、名前の対応（土台の架空の人の電話システムでの名前。1人は「取り込まない名前」＝ `member_id` が空）、承認済みの取り込みの記録と日々のKPI（今月と先月の営業日のうち数日分。架空チームA・Bそれぞれ1日1ファイル。時間帯14区分）、承認前の取り込みの記録1つ（取り込んだ人は、土台の架空の人で管理者の権限がある人）、月の目標（今月。営業に出る人と出ない人を1人以上ずつ。目標が未入力の人を1人残す）、アラート（日ごとと月のペースを数件。対応済・不要だった・未対応を1つ以上ずつ）、設定値 `kpi_holidays`（4章）
   - `fixtures/memo/`：`package.json` の scripts に `fixtures:memo:load`・`fixtures:memo:remove`・`fixtures:memo:cleanup-guard` を足す。入れるもの：一覧（`masters`）の部下メモのテーマ7つ（アポ・リスト・営業・管理・採用・姿勢・その他）と種類4つ（指摘・指導／ほめた／1on1・面談／様子の記録。並び順もこの順）、部下メモ（送ったもの・書きかけ・次の確認日が過ぎて行動・結果が未記入のもの・行動・結果を記録済みのもの・対象者が同じチームの2人のもの・リーダーとメンバーが一緒に対象のもの（MGR が書いた）・代表が書いたもの（書いた人は土台の「テスト代表」。いなければ入れない））
   - 消す範囲：`fixtures:kpi:remove`・`fixtures:memo:remove` は、架空の人とテスト代表に関わる行を、画面で足した分も含めてすべて消す（ロープレの `fixtures:roleplay:remove` と同じ。テスト代表が管理者として取り込んだ記録・入れた目標・書いたメモも）
   - 入れるときの順番：土台の `fixtures:load` を先に（ロープレの架空データはあってもなくてもよい）。消すときは `fixtures:memo:remove`・`fixtures:kpi:remove` を、土台の `fixtures:remove`・`fixtures:remove-ceo` より先に流す（KPIと部下メモの表が名簿を参照しているので、逆だと止まる）。消すときはエラーを確かめ、消せなかったら「消せなかった」と出して終わる
   - `cleanup-guard`：名前が `guard` で始まる人の、KPIと部下メモの表の行（部下メモの対象者 → 部下メモ、アラート → 日々のKPI → 取り込みの記録、月の目標、名前の対応）と、名前が `guard` で始まるCSVのチーム名の対応・一覧・設定値を消す。エラーを確かめる。土台の `fixtures:cleanup-guard` より先に流す（使い方を報告書に書く）
3. 役割の切り替え（`fixtures/foundation/dev-role.mjs`・`dev-role-plan.mjs`）に `admin` を足す：`npm run fixtures:dev-role -- admin` で、テスト代表を「架空チームBのメンバーで、管理者の権限がある人」にする。今のスクリプトと同じく、切り替えるたびにテスト代表自身の `permissions` の行を消してから、`admin` のときだけ管理者の権限の行を足す（ほかの人の行は触らない）。使い方の表示と CLAUDE.md 用の説明を報告書に書く。`tests/foundation/dev-role.test.ts` に `admin` の場合を足す
4. 見る人の情報の部品を土台に移す：`src/features/roleplay/shared/viewer.ts` のうち、業務によらないもの（`buildViewerContext`・`fetchViewerContext`・`canSuperviseMember` と、その中で使う今のチームの求め方）を `src/foundation/viewer.ts` に移し、`ViewerContext` に `isAdmin`（管理者の権限が有効か）を足す。ロープレの `shared/viewer.ts` と `shared/types.ts` は、移したものを土台から読み込んで同じ名前で出し直す（ロープレの画面は書きかえずに動くこと。テストは、`tests/roleplay/shared/viewer.test.ts` の期待値に `isAdmin: false` を足すことと、`tests/foundation/ui-and-routing.test.ts` の左メニューの一覧に 2-5 の4つを足すことだけを許す。ほかは書きかえずに通す）。トーク・研修の判定（`canMoveTalkToTrial` など）と `pickWritableMembers`・`fetchWritableMembers` はロープレに残す
5. 左メニューと入口を作る（部品は足さず、アドレスの「#」で切り替える）
   - 左メニューに「KPIの目標」（`#/kpi-targets`）・「未達の一覧」（`#/kpi-alerts`）・「CSV取り込み」（`#/kpi-import`）・「部下メモ」（`#/memo`）を足す
   - 役割で出し分ける：「KPIの目標」はだれにでも、「未達の一覧」と「部下メモ」はリーダー・MGR・代表だけ、「CSV取り込み」は管理者の権限がある人だけ。出さない人がアドレスで直接開いたときは「この画面は使えません」と出す（読めないことはデータベースが守る。画面の出し分けは使いやすさのため）
   - 入口のファイル（中身は「準備中」と出すだけ）を作る：`src/features/kpi/targets/index.tsx`・`src/features/kpi/alerts/index.tsx`・`src/features/kpi/import/index.tsx`・`src/features/memo/index.tsx`。②③がそれぞれの中身を作る
6. 守りのテスト `tests/guard/kpi-memo.test.ts`（Claude Code が書いた。変更禁止）を通す

## 3. やらないこと
- KPIの画面の中身（CSV取り込み・承認・名前の対応、KPIの目標、未達の一覧）と計算の部品（②で作る）
- 部下メモの画面の中身（③で作る）
- 採用・訪問件・受注の未達（一般日報の区切りで足す）、コール時間・未達の時間数、チーム平均と順位（カルテ第1版）
- 狙うリスト（`call_lists`。一般日報の箱に移した。2026-11-05 本人の選択）
- 週間教育とのつながり（部下メモの `training_id` は列だけ作って空でよい）、過去の記録の取り込み（カルテ第1版）
- ホーム（今日やること）への知らせの集約（カルテ第1版）、設定値の画面（週間教育の区切り）
- 電話システムからの自動の取り込み（自動化の区切り）

## 4. 仕様
参照：設計書 `docs/design/project-dashboard_v28.html` の「3 KPIの取り込み」「3-2 KPIの項目」（月初の目標の立て方を含む）、「5 データの設計図」（「部下メモの形（v14）」「変わりやすいものは一覧と設定値で持つ（v21）」）、「9 画面と権限」（「書く画面の決まり」「管理の画面の決まり」「ログインと安全の決まり」）、「11 1日・1週間の流れ」。表と列の名前は、この計画が正（守りのテストがこの名前を使う）

### 表（名前と項目はこのとおりにする）
| 表 | 項目 |
|---|---|
| `cti_team_map`（CSVのチーム名の対応） | `id`（uuid）、`csv_team_name`（CSVのファイル名に入るチーム名。例：`zoom(WEB)`）、`team_id`（teams）、`valid_from`（date）、`valid_to`（date。空なら今も有効）、`created_by`（members。空でよい＝管理用の鍵で入れたとき）、`created_at` |
| `cti_member_map`（名前の対応） | `id`、`cti_name`（電話システムでの名前）、`member_id`（members。**空なら「取り込まない名前」**＝名簿にいない人の行を毎回飛ばすため）、`valid_from`、`valid_to`（空なら今も有効）、`created_by`（空でよい）、`created_at` |
| `import_logs`（取り込みの記録） | `id`、`target_date`（対象の日）、`csv_team_name`、`team_id`（teams。空でよい）、`file_name`、`row_count`（取り込んだ人の数）、`error_count`、`totals_match`（各列を足すと合計の行と合うか。真偽）、`notes`（jsonb。チェックの結果・警告の中身。初め `[]`）、`status`（`pending`＝承認前／`approved`＝承認済み／`replaced`＝取り込み直しで置きかえた。初め `pending`）、`imported_by`（members）、`imported_at`、`approved_by`（members。空でよい）、`approved_at`、`approval_kind`（`manual`＝人が承認／`auto`＝自動。空でよい）、`replaced_at`、`alerts_created_at`（承認のあとに未達を入れ終えた日時。空ならまだ）、`alert_count`（入れた未達の数。空でよい）。同じ `target_date` と `csv_team_name` で、`status` が `replaced` でない行は1つまで |
| `kpi_entries`（日々のKPI） | `id`、`import_log_id`（import_logs）、`member_id`（members）、`date`（その取り込みの記録の `target_date` と同じ）、`time_slot`（14区分：`'0_8'`＝0:00〜8:59、`'9'`〜`'20'`＝各時台、`'21_23'`＝21:00〜23:59）、`total`（総）・`connected`（実）・`recall`（再）・`owner`（オ）・`prospect`（見）・`apo`（ア）（どれも0以上の整数、初め0）。`import_log_id`・`member_id`・`time_slot` の組は1つまで |
| `kpi_targets`（月の目標） | `id`、`member_id`（members）、`month`（その月の1日。check で1日だけにする）、`goes_to_sales`（営業に出るか。追加のときに名簿の値を写し、そのあとは変わらない＝切り替えは翌月の目標から）、`target_profit`（目標粗利。P）・`unit_price`（単価。P）・`completion_rate`（完了率。%）・`rate_order`（受注率。%）（この4つは営業に出る人だけ必須、出ない人は空）、`apo_target`（アポの目標件数。営業に出ない人だけ必須、出る人は空）、`working_days`（稼働日。1〜31）、`call_hours`（1日のコール時間）、`term`（ターム＝1時間あたりのコール数）、`rate_connected`・`rate_recall`・`rate_owner`・`rate_prospect`（実率・再率・オ率・見率の目標。どれも ÷総 の %）、`rate_apo_owner`（ア/オの目標。%）、`rate_adoption`（採用率の目標。%）、`history`（jsonb。前の値の控え。初め `[]`）、`revised_at`（直した日時。空なら直していない）、`created_at`、`updated_at`。`member_id` と `month` の組は1つまで |
| `alerts`（アラート） | `id`、`import_log_id`（import_logs）、`member_id`（members）、`date`（対象の日）、`compare`（`daily`＝日ごと／`pace`＝月のペース）、`item`（`total`・`connected`・`owner`・`apo_owner`・`apo`、または `target_missing`＝目標が未入力（`compare` は `daily`）。採用・訪問件・受注は一般日報の区切りで足す）、`target`・`actual`（数。`apo_owner` は %、ほかは件数。`target_missing` では空）、`needs_response`（対応の記録を求めるか。真偽）、`response`（`done`＝対応済／`unneeded`＝不要だった。空なら未対応）、`response_reason`（理由。`response` を入れるときは必須）、`responded_by`（members）、`responded_at`、`created_at`。`import_log_id`・`member_id`・`compare`・`item` の組は1つまで |
| `subordinate_memos`（部下メモ） | `id`、`date`、`created_by`（書いた人。members）、`theme_id`（masters の `memo_theme`）、`kind_id`（masters の `memo_kind`）、`noticed`（気づいた内容）、`guidance`（指導した内容）、`next_check_on`（次の確認日。空でよい）、`action_check`（行動＝本人ができたか。`o`／`d`／`x`＝○△×。空でよい）、`result_check`（結果＝数字に出たか。`o`／`d`／`x`。空でよい）、`checked_on`（確かめた日）、`training_id`（関連する週間教育。今は空のまま。ほかの表への鍵にしない＝週間教育の区切りでつなぐ）、`is_legacy`（移した過去の記録の印。初め偽）、`legacy_source`（jsonb。移した過去の記録の原文。今は空）、`submitted_at`（送った日時。空なら書きかけ）、`hidden_at`（見えなくした日時）、`created_at`、`updated_at`。送るとき（`submitted_at` を入れるとき）は、`theme_id`・`kind_id` と、`noticed` か `guidance` のどちらか（空白だけでない）が必須（check） |
| `subordinate_memo_targets`（部下メモの対象者） | `memo_id`（subordinate_memos）、`member_id`（members）、`removed_at`（対象者から外した日時。空なら対象。削除はしない）。`memo_id` と `member_id` の組が主キー |

設定値（`settings`。ロープレ①の表）に足すキー：`kpi_holidays`（会社の休みの日の一覧。`value` は `"YYYY-MM-DD"` の文字の配列。祝日と会社の休みを入れる。土日はここに入れなくても営業日に数えない。2026-11-05 本人の選択）。②の計算の部品がこの名前に頼る

### 権限（RLS。「名簿にいる人」＝ `private.current_member_id()` が空でない人。退職した人は含まない）
| 表 | 読める | 書ける |
|---|---|---|
| `cti_team_map`・`cti_member_map` | 管理者の権限がある人（`private.is_admin()`） | 追加・変更：管理者の権限がある人（追加では `created_by` が自分。変更では `created_by` を変えられない） |
| `import_logs` | 管理者の権限がある人 | 追加：管理者の権限がある人が、`imported_by` を自分・`status` を `pending` にして（違えば止める。トリガーで上書きしない）。`approved_by`・`approved_at`・`approval_kind`・`replaced_at`・`alerts_created_at`・`alert_count` は空のときだけ。変更：管理者の権限がある人（どう変えられるかはトリガーで確かめる。下の「取り込みの記録の状態」） |
| `kpi_entries` | ①承認済みの取り込みの行（`private.is_approved_import(import_log_id)`）で、本人（`member_id` が自分）・`private.can_supervise_member(member_id)` が真の人（リーダー・担当MGR・代表）・管理者の権限がある人（全員分。2026-11-05 本人の選択）。②承認前の行は、取り込んだ管理者だけ（`private.is_my_pending_import(import_log_id)`）。置きかえた取り込みの行は、だれも読めない。同じチームのほかのメンバーは読めない（チーム平均と順位を読む仕組みはカルテ第1版で作る） | 追加：`private.is_my_pending_import(import_log_id)` が真の行だけ（`date` はトリガーが取り込みの記録の `target_date` にする）。変更・削除はだれもできない（取り込み直しは、新しい取り込みの記録で入れ直す。前の数字は消さずに残す） |
| `kpi_targets` | 本人・`private.can_supervise_member(member_id)` が真の人・管理者の権限がある人（全員分。2026-11-05 本人の選択） | 追加・変更：本人（`member_id` が自分）だけ。上席は見るだけ |
| `alerts` | 承認済みの取り込みの行（`private.is_approved_import(import_log_id)`）で、`private.can_supervise_member(member_id)` が真の人（リーダー・担当MGR・代表）。メンバー本人には見せない（監視感を避けるため。設計書11章）。管理者の権限では広げない | 追加：`private.is_my_approved_import(import_log_id)` が真の人（承認した取り込みの分を、承認した管理者が入れる）。追加では `response`・`response_reason`・`responded_by`・`responded_at` は空だけ。`date` はトリガーが取り込みの記録の `target_date` にする。管理者はアラートを読めないので、画面は `.select()` を付けずに入れる。変更：対応の記録（`response`・`response_reason`・`responded_by`・`responded_at`）だけ（列ごとの許可にする）。できるのは、その人と今同じチームのリーダー（`private.current_member_role() = 'leader'` で、`private.current_team_id()` が空でなく `private.member_team_now(member_id)` と同じ。自分のアラートは除く）。変更のあとも承認済みの取り込みの行であること（with check にも `private.is_approved_import(import_log_id)`）。MGR・代表は見るだけ |
| `subordinate_memos` | `created_by = private.current_member_id()`（書いた人。列を直接見る。追加したすぐあとに番号を受け取る `insert().select()` が通るように。関数で表を引き直すと、追加した行がまだ見えず失敗する）か、`private.can_read_memo(id)` が真の人 | 追加：リーダー・MGR・代表（`private.current_member_role() in ('leader','mgr','ceo')`）が、`created_by` を自分にして（代表も書ける。2026-11-05 本人の選択）。変更（`hidden_at` を含む）：書いた人だけ（using は `private.is_memo_writer(id)`、with check は `created_by = private.current_member_id()` と列を直接見る。関数は変更前の行を見るので、with check に関数だけを書くと、書いた人の書きかえを止められない）。ログインした人の追加では、`submitted_at` は空だけ（送るのは変更で）、`is_legacy` は偽・`legacy_source` は空だけ（変更でも変えられない。過去の記録の取り込みは管理用の鍵で行う） |
| `subordinate_memo_targets` | `private.can_read_memo(memo_id)` が真の人 | 追加と、変更（`removed_at` だけ。列ごとの許可にする）：そのメモを書いた人（`private.is_memo_writer(memo_id)`）が、自分ではなく、`private.can_supervise_member(member_id)` が真の人を対象者にするときだけ。外す（`removed_at` を入れる）だけのときは、書いた人なら、異動して上席でなくなった人でも外せる（with check：`private.is_memo_writer(memo_id)` かつ（`removed_at` が空でない、または自分ではなく `private.can_supervise_member(member_id)` が真））。外した人を戻すときは、行を足し直さず `removed_at` を空にする（主キーが同じため） |

- 指導の記録（`subordinate_memos`・`subordinate_memo_targets`）と `alerts` を読む範囲にも書く範囲にも、`private.is_admin()` と `private.can_read_member()` を使わない（管理者の権限では広げない。2026-11-04 本人の選択）
- ログインした人（`authenticated`）には、どの表も削除（DELETE）の許可を出さない。消すのは `hidden_at`・`removed_at`・`status = 'replaced'` などの印だけ
- 管理用の鍵（`service_role`）には、すべての表の読み書きと削除を許す（守りのテストと架空データの出し入れのため）
- ログインしていない人（`anon`）には、何も許さない

### 取り込みの記録の状態（`import_logs` の変更のトリガー）
- `pending` → `approved`：その記録の `imported_by` がログインしている人のときだけ（取り込んだ人が承認する。設計書9章）。トリガーが `approved_by` をログインしている人、`approved_at` を今、`approval_kind` を `manual` にする。**その記録の日々のKPIに出てくる人が、同じ `target_date` のほかの承認済みの記録にも日々のKPIを持っていたら止める**（同じ人が同じ日に2つのファイルに出たら止める。設計書の取り込みのチェック）
- `pending` または `approved` → `replaced`：管理者の権限がある人ならだれでも（取り込み直しのとき、新しく取り込む人が前の記録を置きかえる）。トリガーが `replaced_at` を今にする
- そのほかの状態の変化（`approved` → `pending`、`replaced` から戻すなど）は、だれもできない
- `approved_by`・`approved_at`・`approval_kind`・`replaced_at` は、上のトリガーが入れる値のほかにはできない（画面から送られても止める）
- `alerts_created_at`・`alert_count`：`approved` の記録に、取り込んだ人が、空のときに1回だけ入れられる（未達を入れ終えた印。管理者はアラートを読めないので、②の「未達を出し直す」はこの印が空の記録を探す）
- `target_date`・`csv_team_name`・`file_name`・`imported_by`・`imported_at` は、いつも変えられない。`team_id`・`row_count`・`error_count`・`totals_match`・`notes` は、`pending` の間だけ、取り込んだ人が変えられる
- 取り込み直すときの流れ（②が画面で行う。承認の前も後も同じ）：確認を出す → 前の記録を `replaced` にする（同じ日・同じチーム名で置きかえていない記録は1つまでなので、先に置きかえる）→ 新しい取り込みの記録を作る → 日々のKPIを入れる → 承認する → 未達を計算し直して入れる。新しい記録を承認するまで、その日・そのチームの数字はリーダーたちから見えない。前の記録の日々のKPIとアラートは消さずに残り、だれからも見えなくなる

### 月の目標（`kpi_targets` のトリガー）
- 追加のとき：`goes_to_sales` を名簿（`members`）のその人の値にする（画面から送られた値は使わない）。`history` は `[]`、`revised_at` は空にする
- 変更のとき：`member_id`・`month`・`goes_to_sales`・`history`・`revised_at`・`created_at` は、画面からは変えられない（送られた値は前の値に戻す。列ごとの許可にはせず、表全体に update を許してトリガーで戻す）。目標の値（`target_profit` から `rate_adoption` までと `apo_target`）のどれかが変わり、**今日（`private.today_jst()`）がその月の1日以後なら**、変更の前の目標の値の列すべて（`target_profit` から `rate_adoption` までと `apo_target`）を `{"changed_at": 日時, "values": {列の名前: 前の値, …}}` の形で `history` の最後に足し、`revised_at` を今にする（月が始まる前の入力は、印をつけずに直せる。2026-11-05 本人の選択：いつでも直せ、直したら「修正あり」の印と前の値を残す）。`updated_at` を今にする

### アラート（`alerts` のトリガー）
- 対応の記録を入れる・直すとき：`responded_by` をログインしている人、`responded_at` を今にする。`response` を入れるときは `response_reason`（空白だけでない）が必須

### 部下メモ（`subordinate_memos`・`subordinate_memo_targets` のトリガー）
- 変更のとき、`updated_at` を今にする（送ったあとに直したことは、この日時で画面に出す。前の内容の控えは持たない。2026-11-05 本人の選択）
- `theme_id` は `masters` の `kind = 'memo_theme'`、`kind_id` は `kind = 'memo_kind'` の行であること
- 送るとき（変更で `submitted_at` が空から入るとき。追加では入れられない）は、対象者（`removed_at` が空の行）が1人以上いること
- 対象者を足す・戻す（`removed_at` を空にする）とき：①メモを書いた人自身は対象者にできない ②**そのメモの今の対象者（`removed_at` が空の行）と、今のチーム（`private.member_team_now`）が同じ人だけ**（チームがない人は、ほかの対象者がいないときだけ。2026-11-05 本人の選択：複数選べるのは同じチームの人だけ）

### この区切り全体の決まり
- 業務ごとに分ける：KPIのプログラムは `src/features/kpi/`（`targets/`・`alerts/`・`import/`、KPIの中で共通に使うものは②が `shared/` に作る）、部下メモは `src/features/memo/` に置く（並列の2本がぶつからないように）。KPIの箱と部下メモの箱は、おたがいのフォルダと表を読まない
- 権限は、データベースの段階（RLS）で絞る。判定には土台とロープレ①の関数と、この計画で足す5つの関数（2-1）だけを使う。ほかの判定の関数が要りそうなら、止めて質問する
- 削除はしない。消す操作は「見えなくする」印にする
- ポリシーの中の引数のない関数は `(select private.is_admin())`・`(select private.current_member_id())` のように select で包み、1回の問い合わせで1回だけ計算されるようにする（`kpi_entries` は1か月で約9千行になるため）
- 画面は Rush up 資料デザイン（7章）。PC とスマホの両方で使える形（レスポンシブ）にする

守りのテスト（変更禁止）：`tests/guard/permissions.test.ts`（土台）、`tests/guard/roleplay.test.ts`（ロープレ）、`tests/guard/kpi-memo.test.ts`（KPIと部下メモ。上の権限の表、承認前の数字・置きかえた数字の見え方、取り込みの記録の状態、同じ日に2つのファイルに出た人、月の目標の控え、アラートの対応、部下メモの対象者と本人に見せない決まりを確かめる）

触ってよいファイル・フォルダ：`supabase/migrations/`（新しいファイルを足すだけ）、`fixtures/kpi/`、`fixtures/memo/`、`fixtures/foundation/dev-role.mjs`・`dev-role-plan.mjs`（`admin` を足すだけ）、`src/`（`src/features/roleplay/` は 2-4 の読み込み先の切り替えだけ）、`package.json`（scripts の追加だけ）、`tests/` の中で `tests/guard/` 以外（`tests/roleplay/` は 2-4 で許した直しだけ）、`docs/reports/report_kpi-memo-common_v1.md`
触ってはいけないもの：`tests/guard/`、`fixtures/foundation/` のほかのファイル、`fixtures/roleplay/`、`docs/`（報告書を除く）、`CLAUDE.md`、`NOTES.md`、`README.md`、ルートの `.gitignore`、`samples/`、流し込み済みのマイグレーションのファイル

## 5. 決めてよいこと／決めてはいけないこと

| 決めてよい | 決めてはいけない（止めて質問する） |
|---|---|
| 変数名・関数名（4章で名前を決めたものを除く）、ファイル内の書き方、架空データの中身（架空の名前と数字だけ）、トリガーの関数の名前 | 4章の表の名前・項目・権限の範囲、ライブラリの追加 |
| 入口の「準備中」の見た目（Rush up 資料デザインに従う）、`src/foundation/viewer.ts` の中の書き方 | 左メニューに出す画面と出し分け、この計画にない仕様 |

## 6. 完了条件（すべて満たしたら完了）
- [ ] 4章の表・関数・権限・トリガーが、すべて `supabase/migrations/` の新しいファイルにあり、`npm run db:push -- --dry-run` のあと `npm run db:push` で流し込み済み
- [ ] `npm run fixtures:load` のあと `npm run fixtures:kpi:load`・`npm run fixtures:memo:load` で架空データが入り、`fixtures:memo:remove`・`fixtures:kpi:remove` のあと `fixtures:remove` で消せる（名前は架空だけ）。`fixtures:memo:cleanup-guard`・`fixtures:kpi:cleanup-guard` のあと `fixtures:cleanup-guard` で、守りのテストの残りが消える
- [ ] `npm run fixtures:dev-role -- admin` で管理者に切り替わり、ほかの役割に戻すと管理者の権限が外れる
- [ ] 左メニューに4つの入口が役割どおりに出て、どれも「準備中」で開ける。ロープレの画面は今までどおり動く（本人が確かめる手順を報告書に書く）
- [ ] `npm test` で、守りのテスト（土台・ロープレ・KPIと部下メモ）とほかのテストがすべて通る（ログインの回数の上限は 0-6）
- [ ] `npm run build`（型の点検と組み立て）がエラーなく通る
- [ ] 守りのテストを変更・削除・スキップしていない
- [ ] `git ls-files` に `.env` が出ない
- [ ] 報告書に「Security Advisor の確認が要る」と書いた
- [ ] 報告書を書いてコミットした

## 7. 守ること（毎回同じ。ひな形から変えない）

### データと秘密
- 社員の実名・人事評価を含むデータを作らない・読み込まない。開発用の見本は架空の名前と数字だけにし、fixtures/ に置く
- samples/ には本物の見本データ（実名あり）が入っている。開かない・読まない・検索しない・コピーしない
- APIキーは .env に置き、コードに書かない。.env の中身を表示・出力しない
- .gitignore を変更しない
- 雛形を作る道具（`npm create` など）で、既にあるファイル・フォルダ（ルートの `.gitignore`・README.md・CLAUDE.md・NOTES.md・docs/・tests/）を上書き・削除しない
- コミットの前に `git status` を見て、`.env` が入っていないことを確かめる

### 安全の決まり（2026-10-28 本人の選択）
- 表を足すときは、マイグレーションの中で RLS（行ごとの読み書きの決まり）をオンにする（`alter table ... enable row level security` を明示。自動の設定に頼らない）
- 表ごとの許可（GRANT）をマイグレーションに明示する。`authenticated` は必要な操作だけ（行の範囲は RLS で絞る）、`service_role` は守りのテストのため読み書きと削除、`anon`（ログインしていない人）には何も許可しない
- `service_role` の鍵と、表を流し込むための接続の文字（`SUPABASE_DB_URL`）は画面のコード（`src/`）で使わない。`VITE_` を付けた名前にしない（`VITE_` の付いた値は画面に埋め込まれ、だれでも見られるため）
- 表や権限を変えた計画では、報告書に「Security Advisor の確認が要る」と書く（Supabase の管理画面は本人のアカウントでしか開けない。本人が開いて写しを送り、Claude Code がレビューで確かめる）

### AI本人版レポート
- 本人版のAIへの入力に、部下メモ・責任者日報を含めない（コードで除外する）
- 守りのテストを変更・削除・スキップしない。通らないときはコードを直す。直せなければ止めて報告する

### 数値
- 数値計算はプログラムで行い、AIには計算済みの数値だけを渡す

### 変えやすくする（2026-10-10 本人の方針）
- 変わりやすいもの（商材、見込みのランク、部下メモのタグ、トークの分類の言葉、テーマの一覧、判定の線などの数字）は、コードに直接書かない。一覧（マスタ）の表か設定値として持ち、管理者が画面で足す・変えられるようにする
- 一覧や設定値を変えたら監査ログに残す。一覧の項目を消すときは論理削除にし、過去の記録の表示が崩れないようにする

### 業務ごとに分ける（2026-10-30 本人の方針）
- 業務（日報・ロープレ・KPI など）ごとに、表（マイグレーション）・画面・フォルダ（`src/features/〈業務〉/`）を分ける。ほかの業務のフォルダは触らない
- ほかの業務の表を書きかえない。複数の業務の表を読むのは、ダッシュボード・カルテ・AI分析だけ
- 名簿・ログイン・権限の土台は1つ。業務ごとに名簿や権限の仕組みを作らない

### 画面（Rush up 資料デザイン）
- 赤は1画面1〜2か所。未達は赤にしない（黒字＋▼＋「未達」）。増減には▲▼を必ず付ける
- 絵文字なし、影なし。画面の文言はすべて日本語

### Git
- 作業は作業用ブランチだけで行う。本線（main）に直接コミットしない
- コミットは区切りごとに行い、メッセージは日本語で「何をしたか」を書く
- 本線への取り込み（merge）、push、`--force`、履歴の書き換え（rebase・reset --hard）はしない

### 作業範囲
- 作業するのは、この計画の「作業するフォルダ」（C:\Workspace\apps\sales-plus1-worktrees\ の中の、この計画専用のフォルダ）の中だけ。元のフォルダ C:\Workspace\apps\sales-plus1 や、ほかの計画の作業用フォルダは触らない
- 4章の「触ってよいファイル・フォルダ」の外は変更しない。必要になったら止めて質問する
- ファイルやフォルダを削除する前、新しいフォルダを作る前は確認を取る（docs/reports/ は作ってよい。4章の「触ってよい」に挙げたフォルダも作ってよい）

## 8. 終わったら
1. 作業結果を `docs/reports/report_kpi-memo-common_v1.md` に、下の書式で書く
2. 報告書もコミットする
3. 作業用ブランチのまま終える（本線 main には切り替えない。作業用フォルダでは本線に切り替えられない）。作業用フォルダとブランチは消さない（Claude Code がレビューし、取り込んだあとに片づける）

### 報告書の書式
- 作業用ブランチ名（並列のときは作業したワークツリーのフォルダも）
- 計画ファイルを受け取った日と、作業を終えた日（1つ作るごとの日数を測るため）
- 変更したファイルの一覧（4章の「触ってよい」範囲の外がないこと）
- 本人が画面で確かめる手順（3〜5行。だれでログインし、どこを押して、何が見えればOKか）
- やったこと
- 決められずに止めたこと・質問
- テストの結果（通った数／全体）
- 守りのテストに触れていないことの確認
- Security Advisor の確認が要るかどうか（表や権限を変えた計画のとき）
- 0-4 で報告した、読み込んでいたルールファイル
- 気になった点
