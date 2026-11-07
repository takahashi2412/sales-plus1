# 計画：カルテ第1版①：共通（plan_karte-common_v1）

作成日：2026-11-07 ／ 仕上げ：2026-11-07（別のエージェントの点検21件を反映） ／ 作成：Claude Code ／ 作業：Antigravity
作業用ブランチ：task/karte-common
並列：なし（この計画のあとに、②plan_karte_v1 と ③plan_admin_v1 を2本の並列で作る）
作業するフォルダ：C:\Workspace\apps\sales-plus1-worktrees\karte-common\（Claude Code が用意した、この計画専用の作業用フォルダ（ワークツリー）。作業用ブランチもできている）

> この計画に書いていないことは、進めずに質問してください。

## 0. 最初に必ずやること
1. 今開いているフォルダが、上の「作業するフォルダ」であることを確かめる。違っていたら、作業を始めずに報告する（元のフォルダ C:\Workspace\apps\sales-plus1 では作業しない）
2. `git status` で、作業用ブランチ `task/karte-common` にいること、変更が残っていないことを確かめる。違っていたら、作業を始めずに報告する。ブランチは作らない・切り替えない（Claude Code が最新の本線から作ってある）
3. `.env` があるかどうかだけを確かめる（中身は開かない・表示しない）。なければ止めて報告する
4. 今読み込んでいるルールファイル（AGENTS.md・GEMINI.md など）をすべて挙げて報告する。なければ「なし」と報告する
5. `npm install` をしてから `npx vitest run tests/guard/permissions.test.ts tests/guard/roleplay.test.ts tests/guard/kpi-memo.test.ts tests/foundation tests/roleplay tests/kpi tests/memo` を回し、今の守りのテストと画面・計算のテストがすべて通ることを確かめる（通らなければ、作業を始めずに報告する）。次の2つは、この計画で作る決まりがまだないので、始める前は落ちてよい（作り終えたら通す）：`tests/guard/karte.test.ts`（14件のうち9件ほど）と、`tests/guard/roleplay.test.ts` の「退職した人の名簿の行は消えず、代表と、最後にいたチームの今のリーダーは読める」の1件。ほかが落ちたら、作業を始めずに報告する
6. ログインの回数の上限：守りのテストは、1回でテスト用の人が 29 回ログインする（土台9・ロープレ10・KPIと部下メモ7・カルテ3）。開発用の Supabase は、ログインが5分に30回までのことがある。429（回数の上限のエラー）や「rate limit」が出たら、5分待ってから回す。守りのテストを続けて何度も回さない（直したあとにまとめて1回。カルテだけを確かめるときは `npx vitest run tests/guard/karte.test.ts`）
7. テストは、外につながる形で回す（開発用の Supabase に届かない囲いの中で回すと「fetch failed」になる）

## 1. 目的（なぜやるか）
カルテ第1版の先頭で、2本の並列（②カルテとリーダー用ホーム、③管理の画面2つ）がぶつからないように、表の直し・権限・設定値・架空データ・左メニューと入口を、先に1本で作る。あわせて、KPI・部下メモの区切りから持ち越した KPI の直し（稼働する土曜など）をここで行う。

## 2. やること
1. 新しいマイグレーションのファイルを `supabase/migrations/` に足す（番号は `20261105000005` より後。例：`20261107000006_karte_common.sql`。流し込み済みのファイルは直さない）。中身は4章の「表と権限の直し」のとおり
2. 架空データ `fixtures/karte/`（`data.mjs`・`load.mjs`・`remove.mjs`・`cleanup-guard.mjs`）を作り、`package.json` に `fixtures:karte:load`・`fixtures:karte:remove`・`fixtures:karte:cleanup-guard` を足す。中身は4章の「架空データ」のとおり。入れる順は 土台 → ロープレ → KPI → 部下メモ → カルテ、消す順はその逆（カルテが先）
3. 役割の切り替え（`fixtures/foundation/dev-role-plan.mjs`・`dev-role.mjs`）に `leader-admin`（架空チームAのリーダーで、管理者の権限がある人）を足す。今の `admin`（架空チームBのメンバーで管理者）は残す。`tests/foundation/dev-role.test.ts` も合わせて直す
4. 左メニューと入口（4章の「左メニューと入口」）：`src/components/layout/AppLayout.tsx` と `src/App.tsx` に4つの入口を足し、それぞれの箱に「準備中」の画面を置く。中身は②③で作る
5. 名簿の確認の画面（`src/foundation/directory.ts`・`DirectoryView.tsx`）：退職した人は、一覧の下にまとめ「退職」の印をつける（4章の1で、リーダー・MGR にも、最後のチームの退職した人が見えるようになるため）
6. KPI の持ち越し（4章の「KPI の持ち越し」）：`src/features/kpi/` の計算の部品とテストを直す
7. 守りのテスト（Claude Code が書いて置いてある。変更しない）がすべて通るようにする。`tests/guard/karte.test.ts` は新しく足したもの。`tests/guard/roleplay.test.ts` の「退職した人の名簿の行」の期待値と、守りのテスト3本の片づけ（監査ログ）は、Claude Code が4章に合わせてもう直してある
8. 表を変えたので、本人が Security Advisor を確かめる。報告書に「Security Advisor の確認が要る」と書く

## 3. やらないこと
- カルテ・ホーム・管理の画面の中身（②③で作る）
- 過去の記録（本物）の取り込みと、取り込みの道具（④で作る。この計画では、ロープレの過去の記録の印の列と、架空の過去の形の記録だけ。本物の過去の記録は、ロープレの「テーマ」などの空にできない列や、部下メモの「送ったときはテーマと種類が必須」の決まりに入らないものがあるので、表の直しは④で行う）
- 本番用の環境の準備（⑤）
- メンバー用のカルテ（制限版）と、メンバーに見せる順位の仕組み（一般日報の区切り）
- 設定値を変える画面（週間教育の区切り）

## 4. 仕様
参照：設計書 `docs/design/project-dashboard_v29.html` の「9 画面と権限」（権限の表・管理の画面の決まり・ログインと安全の決まり）、「10 画面の構図」、「3-2」（時間帯の帯・コール時間）。NOTES.md の決めたことの表（2026-11-05 の KPI の行、2026-11-07 のカルテ第1版の行）。今の表と権限は `supabase/migrations/` の5本

### 表と権限の直し（マイグレーション）
新しく作る関数とトリガーの関数は、どれも `security definer`・`set search_path = ''` にし、`public, anon` から実行の許可を外す（読む決まりで使う関数は `authenticated, service_role` に許可する）。トリガーは、管理用の鍵（`service_role`）のときは止めない（架空データ・守りのテスト・④の取り込みのため）。止めるときはエラーにする（黙って値を変えて通さない）。

1. **退職した人の記録を読める人**（2026-11-07 本人の選択：最後にいたチームの今のリーダー・担当MGRと代表）。**読む決まりだけを広げ、書く決まり（`private.can_supervise_member`）は変えない**
   - 関数 `private.member_supervision_team(target uuid) returns uuid`（`stable`）：その人の退職日（`members.retired_on`）が今日（日本時間、`private.today_jst()`）より前なら、その人の所属の履歴（`member_affiliations`）のうち `start_date` がいちばん新しい行の `team_id` を返す。退職していなければ `private.member_team_now(target)` を返す
   - 関数 `private.can_read_records_of(target uuid) returns boolean`（`stable`）：`private.can_supervise_member(target)` が真なら真。そうでなく、target が退職していて（上と同じ判定）、見る人が「今のチーム ＝ `member_supervision_team(target)` のリーダー」か「`member_supervision_team(target)` を今担当している MGR」なら真。自分自身は偽（今と同じ）
   - 次の読む決まりだけで、今の `private.can_supervise_member(...)` の呼び出しを `private.can_read_records_of(...)` に置きかえる（ほかの条件はそのまま写す。`drop policy` → `create policy`、関数は `create or replace`）
     - `private.can_read_member(p_target_member_id)`：今の判定に「`private.can_read_records_of(p_target_member_id)` が真なら読める」を足す（名簿と所属の履歴が読めるようになる）
     - `kpi_entries_select_policy`（005 の 957行）、`kpi_targets_select_policy`（005 の 986行）
     - `roleplays_select_policy`（003 の 658行）
     - `private.can_read_memo(memo)`（005）の最後の判定（対象者のだれかを上席として見ているか）
   - 置きかえないもの（今のまま）：`alerts`（未達の対応は今のメンバーだけ）、`member_themes`（テーマ表の知らせに退職した人を出さない）、`seminars`・`seminar_members`、`talks`、すべての書く決まり
   - **退職した人を対象にした新しい記録は書けない**（代表も。トリガーで止める。今ある行を直す・見えなくするのは今の決まりのまま）
     - `roleplays`：追加のとき、または `member_id` を変えるときに、その `member_id` が退職日を過ぎた人
     - `member_themes`：追加のとき、または `member_id` を変えるとき
     - `subordinate_memo_targets`：追加のとき、または `removed_at` を空に戻すとき
     - `seminar_members`：追加のとき、`member_id` を変えるとき、`removed_at` を空に戻すとき（今の作りでは、退職した人を研修の参加者に足せてしまう）
2. **ロープレの過去の記録の印**：`roleplays` に `is_legacy boolean not null default false` と `legacy_source jsonb` を足す。ログインした人は、追加で `is_legacy` を真にしたり `legacy_source` を入れたりできず、変更でも2つを変えられない（トリガーでエラーにする。部下メモの `is_legacy`・`legacy_source` と同じ形）
3. **最後の1人の管理者は外せない**（2026-11-07 本人の選択）。抜け道をふさぐため、次をすべて行う（エラーの文に `last admin` を入れる）
   - `permissions` の変更のトリガー：ログインした人は、`member_id`・`kind`・`granted_by`・`granted_at` を変えられない（外す＝`revoked_at`・`revoked_by` を入れることだけができる）。外した権限を戻す（`revoked_at` を空に戻す）こともできない
   - `kind = 'admin'` の行の `revoked_at` を入れるとき：まず有効な管理者の行（`kind = 'admin'`・`revoked_at` が空）を `for update` で押さえてから、その行のほかに「有効で、その人の退職日が今日より前でない」管理者が1人もいなければ止める（2人が同時にお互いを外しても、最後の1人が残るように）
   - `members` の変更のトリガー：退職日を今日以前の日にするとき、その人が有効な管理者で、ほかに有効な管理者がいなければ止める
4. **役割を「代表」にする・「代表」から外すのは代表だけ**（2026-11-07 本人の選択）：`members` の追加・変更のトリガー。ログインした人が `role` を `ceo` にする（追加でも）、または `ceo` からほかに変えるのは、その人が代表（`private.is_ceo()`）で、かつ名簿を直せる（管理者の権限がある）ときだけ。それ以外はエラー。代表の行は、⑤の本番の準備で管理用の鍵で入れる
5. **チームを作れる人**：`teams` に、管理者の権限がある人だけが追加・変更（名前）できる許可を足す（`grant insert, update on table public.teams to authenticated` と RLS の決まり。削除は許さない）。名簿の取り込みで新しいチームが要るため
6. **監査ログ**：`members`・`member_affiliations`・`mgr_assignments`・`teams` の追加・変更・削除を、今ある `private.record_audit_log()` で監査ログに残す（トリガーを足す。`permissions`・`settings` はもう残っている）
7. **設定値**（2026-11-05・2026-11-07 本人の選択）：設定値の名前を次の2つにする。表は今の `settings` のまま（新しい表は作らない）
   - `karte_call_hour_threshold`：コール時間の線。数（初めは 17）
   - `kpi_workdays`：稼働する土曜の日付の一覧（`"YYYY-MM-DD"` の配列。初めは空の配列）
   - 最初の行は、開発用は架空データ（`fixtures/karte`）で入れる。本番は⑤で入れる

### KPI の持ち越し（`src/features/kpi/`。2026-11-05 本人の選択と区切りの点検）
1. 営業日（`shared/businessDays.ts`）：営業日 ＝ 平日のうち `kpi_holidays` にない日 ＋ `kpi_workdays` にある土曜。設定値 `kpi_workdays` がないときは稼働する土曜なし。取り込み・目標・未達の各画面で、設定値 `kpi_workdays` も読んで渡す
2. 未達（`shared/alerts.ts`）：対象の日が営業日でないとき（入れていない土曜と日曜・休みの日）は、日ごとも月のペースも未達を出さない（目標が未入力の未達も出さない）。その日にかけた数は、次の営業日の月のペースの累計には入る
3. あるべきの部品を外から使えるようにする：`shared/` に、月の目標・基準の日・その月の営業日の一覧から「あるべき」（月の目標 × 基準の日までの営業日の数 ÷ 月の営業日の数）を返す関数を足して書き出す（②のカルテが使う。今の `alerts.ts` の中の計算もそれを使う形にしてよい）
4. テストを足す：稼働する土曜が営業日の数とあるべきに入ること、入れていない土曜の取り込みで未達が出ないこと、稼働する土曜に新しく遅れて次の営業日も遅れている例で、次の営業日に対応を求めないこと（前の営業日が土曜になる）、あるべきの関数
5. 小さな点：`import/api.ts` の `generateAlertsForApprovedImport` の説明のコメント（`ignoreDuplicates` と書いてある）を、今の作り（まとめて insert・23505 は入れ終えた扱い）に直す。差が0以上のときに「▲+」と記号が二重になる所を「▲」だけにする（`alerts/index.tsx` と `targets/index.tsx` の2か所。全部で3か所）

### 左メニューと入口（`src/components/layout/AppLayout.tsx`・`src/App.tsx`）
| 入口（ハッシュ） | 左メニューの名前 | 出す人 | 画面（何も受け取らない部品にする） | 置く場所 |
|---|---|---|---|---|
| `#/home` | ホーム | リーダー・MGR・代表（メンバーは一般日報の区切りで） | `HomePage` | `src/features/home/index.tsx` |
| `#/karte` | メンバーカルテ | リーダー・MGR・代表 | `KartePage` | `src/features/karte/index.tsx` |
| `#/admin-members` | 名簿の管理 | 管理者の権限がある人 | `AdminMembersPage` | `src/features/admin/members/index.tsx` |
| `#/admin-permissions` | 権限の管理 | 管理者の権限がある人と代表 | `AdminPermissionsPage` | `src/features/admin/permissions/index.tsx` |
- 左メニューの並びは、ホームを一番上、メンバーカルテを2番目、管理の2つを一番下にする。ほかの項目の並びは変えない。`tests/foundation/ui-and-routing.test.ts` の左メニューの並びの期待値は、この新しい並びに書きかえてよい（足す・直すのは左メニューの4つの分だけ）
- 出さない人がアドレスで直接開いたときは、今と同じく「この画面は使えません」と出す（`canAccessRoute`）
- ログインした直後（アドレスに `#/…` がないとき）に開く画面：リーダー・MGR・代表はホーム、メンバーは今のまま名簿の確認。`parseHashRoute('')` は今のまま `directory` を返し、ホームに切り替えるのは `App.tsx` で見る人の役割を読んだあとに行う
- カルテで選んだ人（`#/karte?member=…`）は、カルテの画面が自分でアドレスから読む（`App.tsx` から渡さない）。`parseHashRoute` は `?` 以降を無視して `karte` を返すようにする
- 4つの画面は「準備中」の1枚だけ（見出しと「カルテ第1版の②③で作ります」の1行）。左メニューのテスト（`tests/foundation/`）に4つの出し分けを足す

### 架空データ（`fixtures/karte/`。名前は土台の架空の人と「架空〇〇」だけ）
- 設定値：`karte_call_hour_threshold` ＝ 17、`kpi_workdays` ＝ `["2026-10-24"]`（過ぎた土曜。その日の KPI も入れる）
- KPI の推移：架空チームAの人（リーダーA・メンバーA・メンバーB）について、2026-09-01 から 2026-11-06 までの営業日の、承認済みの取り込みの記録と日々のKPI（14の時間帯。数字は架空。日によって上下させ、弱い時間帯がわかるように、ある時間帯だけ低めにする）。次の日は入れない：KPI の架空データ（`fixtures/kpi`）の取り込みの日（2026-10-29・10-30・11-02・11-04・11-05）と、`kpi_holidays` の日（10-12・11-03）。土曜は、稼働する土曜（10-24）と、入れていない土曜を1日（10-17。未達が出ないことを見せる）だけ入れる
- 月の目標：同じ3人の 2026年9月と10月の分だけ（11月は `fixtures/kpi` の目標を使う。同じ人・同じ月の目標は1つまでなので重ねない）。消すときも9月と10月の分だけを消す
- 退職した人：架空チームAにいて退職した「架空退職メンバー」（退職日は 2026-10-07、所属はその日で閉じる）。その人の承認済みのKPI・目標・ロープレの記録・部下メモ（書いた人はリーダーA）を少し
- 過去の形の記録：ロープレ（`is_legacy` 真・`legacy_source` に架空の元の行）を3件、部下メモ（同じ）を3件。対象はメンバーA。今の表の決まり（空にできない列）に入る形で作る
- 消すとき（`remove.mjs`）は、`fixtures/karte` で入れた行だけを消す（ほかの架空データとテスト代表の行は残す）
- `cleanup-guard.mjs` は、守りのテスト `karte.test.ts` が途中で止まったときの残り（名前が `guardkt` で始まる人・チーム・テーマ・一覧と、その人たちの KPI の取り込みの記録・日々のKPI・ロープレ・テーマ表・部下メモ・研修・権限・所属・担当、それらの監査ログ）を片づける

### この区切り全体の決まり
- カルテ・ホーム（②）は「集める画面」なので、ほかの業務の表を読んでよい（書かない）。計算は `src/features/kpi/shared/` の部品を読み込んで使ってよい。ホームの件数は、今の画面と数え方をそろえるため、`src/features/memo/memo-logic.ts` の `pickPendingCheckMemos` と `src/features/roleplay/record/logic.ts` の `buildThemeNoticesSummary` を読み込んで使ってよい（どれも書きかえない）
- 管理の画面（③）は土台の表（名簿・所属・MGRの担当・チーム・権限）だけを読み書きする
- ④（過去の記録の取り込み）は、管理用の鍵の Supabase の接続で入れる（新しいトリガーは管理用の鍵のときだけ通すため。`SUPABASE_DB_URL` での直接の接続では止められる）

守りのテスト（変更禁止）：`tests/guard/permissions.test.ts`、`tests/guard/roleplay.test.ts`、`tests/guard/kpi-memo.test.ts`、`tests/guard/karte.test.ts`

触ってよいファイル・フォルダ：`supabase/migrations/`（新しいファイルを足すだけ）、`fixtures/karte/`、`fixtures/foundation/dev-role-plan.mjs`・`dev-role.mjs`（`leader-admin` を足すだけ）、`package.json`（`scripts` に3行足すだけ）、`src/components/layout/AppLayout.tsx`、`src/App.tsx`、`src/foundation/directory.ts`・`src/foundation/DirectoryView.tsx`（退職した人の並べ方だけ）、`src/features/home/`、`src/features/karte/`、`src/features/admin/`、`src/features/kpi/`（4章の「KPI の持ち越し」だけ）、`tests/foundation/`、`tests/kpi/`、`docs/reports/report_karte-common_v1.md`
触ってはいけないもの：流し込み済みのマイグレーション、`fixtures/`（上に挙げたもののほか）、守りのテスト（`tests/guard/`）、`src/foundation/`（上に挙げた2つのほか）、`src/features/roleplay/`・`src/features/memo/`、`docs/`（報告書を除く）、`CLAUDE.md`、`NOTES.md`、`README.md`、ルートの `.gitignore`、`samples/`

## 5. 決めてよいこと／決めてはいけないこと

| 決めてよい | 決めてはいけない（止めて質問する） |
|---|---|
| 変数名・関数名、ファイル内の書き方、トリガーの名前、エラーの文（4章で指定した言葉は入れる） | 4章にない表・列・権限の変更、新しい表、ライブラリの追加 |
| 架空データの数字の細かいところ（4章の条件の中で） | 退職した人の記録を読める人・置きかえる読む決まりの範囲、権限を外せる人、役割を変えられる人、左メニューの出し分け、この計画にない仕様 |

## 6. 完了条件（すべて満たしたら完了）
- [ ] 新しいマイグレーションを `npm run db:push -- --dry-run` で確かめてから流し込んだ（流し込みの前に、本人の許可を取る。Claude Code が SQL を読む）
- [ ] 架空データを `npm run fixtures:karte:load` で入れ、`fixtures:karte:remove` で消せ、もう一度入れられる
- [ ] 左メニューの4つの入口が役割どおりに出て、出さない人は「この画面は使えません」になる。リーダー・MGR・代表はログインの直後にホームが開く（本人が確かめる手順を報告書に書く。役割は `npm run fixtures:dev-role -- 〈leader／member／mgr／admin／leader-admin／ceo〉`。終わったら `ceo` に戻す）
- [ ] 名簿の確認で、退職した人が下にまとまり「退職」の印が出る
- [ ] KPI の持ち越しのテストがある
- [ ] `npm test`（守りのテストを含む）がすべて通る
- [ ] `npm run build`（型の点検と組み立て）がエラーなく通る
- [ ] 守りのテストを変更・削除・スキップしていない
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
1. 作業結果を `docs/reports/report_karte-common_v1.md` に、下の書式で書く
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
