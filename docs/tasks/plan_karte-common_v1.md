# 計画：カルテ第1版①：共通（plan_karte-common_v1）

作成日：2026-11-07 ／ 作成：Claude Code ／ 作業：Antigravity
作業用ブランチ：task/karte-common
並列：なし（この計画のあとに、②plan_karte_v1 と ③plan_admin_v1 を2本の並列で作る）
作業するフォルダ：C:\Workspace\apps\sales-plus1-worktrees\karte-common\（Claude Code が用意した、この計画専用の作業用フォルダ（ワークツリー）。作業用ブランチもできている）

> この計画に書いていないことは、進めずに質問してください。

## 0. 最初に必ずやること
1. 今開いているフォルダが、上の「作業するフォルダ」であることを確かめる。違っていたら、作業を始めずに報告する（元のフォルダ C:\Workspace\apps\sales-plus1 では作業しない）
2. `git status` で、作業用ブランチ `task/karte-common` にいること、変更が残っていないことを確かめる。違っていたら、作業を始めずに報告する。ブランチは作らない・切り替えない（Claude Code が最新の本線から作ってある）
3. `.env` があるかどうかだけを確かめる（中身は開かない・表示しない）。なければ止めて報告する
4. 今読み込んでいるルールファイル（AGENTS.md・GEMINI.md など）をすべて挙げて報告する。なければ「なし」と報告する
5. `npm install` をしてから `npx vitest run tests/guard/permissions.test.ts tests/guard/roleplay.test.ts tests/guard/kpi-memo.test.ts tests/foundation tests/roleplay tests/kpi tests/memo` を回し、今の守りのテストと画面・計算のテストがすべて通ることを確かめる（通らなければ、作業を始めずに報告する）。`tests/guard/karte.test.ts` は、この計画で作る決まりがまだないので、始める前は落ちてよい（作り終えたら通す）
6. ログインの回数の上限：守りのテストは、1回でテスト用の人が 29 回ログインする（土台9・ロープレ10・KPIと部下メモ7・カルテ3）。開発用の Supabase は、ログインが5分に30回までのことがある。429（回数の上限のエラー）や「rate limit」が出たら、5分待ってから回す。守りのテストを続けて何度も回さない（直したあとにまとめて1回。カルテだけを確かめるときは `npx vitest run tests/guard/karte.test.ts`）
7. テストは、外につながる形で回す（開発用の Supabase に届かない囲いの中で回すと「fetch failed」になる）

## 1. 目的（なぜやるか）
カルテ第1版の先頭で、2本の並列（②カルテとリーダー用ホーム、③管理の画面2つ）がぶつからないように、表の直し・権限・設定値・架空データ・左メニューと入口を、先に1本で作る。あわせて、KPI・部下メモの区切りから持ち越した KPI の直し（稼働する土曜など）をここで行う。

## 2. やること
1. 新しいマイグレーションのファイルを `supabase/migrations/` に足す（番号は `20261105000005` より後。例：`20261107000006_karte_common.sql`。流し込み済みのファイルは直さない）。中身は4章の「表と権限の直し」のとおり
2. 架空データ `fixtures/karte/`（`data.mjs`・`load.mjs`・`remove.mjs`・`cleanup-guard.mjs`）を作り、`package.json` に `fixtures:karte:load`・`fixtures:karte:remove`・`fixtures:karte:cleanup-guard` を足す。中身は4章の「架空データ」のとおり。入れる順は 土台 → ロープレ → KPI → 部下メモ → カルテ、消す順はその逆（カルテが先）
3. 左メニューと入口（4章の「左メニューと入口」）：`src/components/layout/AppLayout.tsx` と `src/App.tsx` に4つの入口を足し、それぞれの箱に「準備中」の画面を置く（`src/features/home/index.tsx`・`src/features/karte/index.tsx`・`src/features/admin/members/index.tsx`・`src/features/admin/permissions/index.tsx`）。中身は②③で作る
4. KPI の持ち越し（4章の「KPI の持ち越し」）：`src/features/kpi/` の計算の部品とテストを直す
5. 守りのテスト `tests/guard/karte.test.ts`（Claude Code が書いて置いてある。変更しない）が通るようにする
6. 表を変えたので、本人が Security Advisor を確かめる。報告書に「Security Advisor の確認が要る」と書く

## 3. やらないこと
- カルテ・ホーム・管理の画面の中身（②③で作る）
- 過去の記録（本物）の取り込みと、取り込みの道具（④で作る。この計画では列と架空の過去の形の記録だけ）
- 本番用の環境の準備（⑤）
- メンバー用のカルテ（制限版）と、メンバーに見せる順位の仕組み（一般日報の区切り）
- 設定値を変える画面（週間教育の区切り）

## 4. 仕様
参照：設計書 `docs/design/project-dashboard_v29.html` の「9 画面と権限」（権限の表・管理の画面の決まり・ログインと安全の決まり）、「10 画面の構図」、「3-2」（時間帯の帯・コール時間）。NOTES.md の決めたことの表（2026-11-05 の KPI の行、2026-11-07 のカルテ第1版の9行）。今の表と権限は `supabase/migrations/` の5本

### 表と権限の直し（マイグレーション）
1. **退職した人の記録を読める人**（2026-11-07 本人の選択：最後にいたチームの今のリーダー・担当MGRと代表）
   - 関数 `private.member_supervision_team(target uuid) returns uuid` を足す：その人の退職日（`members.retired_on`）が今日（日本時間）より前なら、その人の所属の履歴（`member_affiliations`）のうち `start_date` がいちばん新しい行のチームを返す。退職していなければ `private.member_team_now(target)` を返す。`security definer`・`set search_path = ''`・`stable`。`public, anon` から実行の許可を外し、`authenticated, service_role` に許可する
   - `private.can_supervise_member(target)` を作り直す（`create or replace`）：リーダーは「自分の今のチーム ＝ `member_supervision_team(target)`」、MGR は「今担当しているチーム（`mgr_assignments` の今の期間）＝ `member_supervision_team(target)`」。代表はいつも真。自分自身はいつも偽（今と同じ）
   - `private.can_read_member(target)` を作り直す：今の判定に加え、`private.can_supervise_member(target)` が真なら読める（退職した人の名簿の行を、最後のチームの今の上席が読めるように）
   - 書く決まりは広げない：退職日を過ぎた人を対象にした新しい記録は書けないようにする。トリガー（`service_role` は通す）で、次の追加と変更を止める
     - `roleplays` の `member_id`（追加のとき）
     - `member_themes` の `member_id`（追加のとき）
     - `subordinate_memo_targets` の `member_id`（追加のとき、`removed_at` を空に戻すとき）
     - `seminar_members` の `member_id`（追加のとき）
   - 今ある行の読み書き（見えなくする・直すなど）は、今の決まりのまま
2. **ロープレの過去の記録の印**：`roleplays` に `is_legacy boolean not null default false` と `legacy_source jsonb` を足す。ログインした人は、追加で `is_legacy` を真にしたり `legacy_source` を入れたりできず、変更でも2つを変えられない（トリガー。`service_role` は通す。部下メモの `is_legacy`・`legacy_source` と同じ形）
3. **最後の1人の管理者は外せない**（2026-11-07 本人の選択）：`permissions` の変更のトリガー（`service_role` は通す）。`kind = 'admin'` の行の `revoked_at` を空から日時にするとき、その行のほかに「`kind = 'admin'`・`revoked_at` が空・その人の退職日が今日より前でない」行が1つもなければ止める（エラーの文に `last admin` を入れる）
4. **チームを作れる人**：`teams` に、管理者の権限がある人だけが追加・変更（名前）できる許可を足す（`grant insert, update on table public.teams to authenticated` と RLS の決まり。削除は許さない）。名簿の取り込みで新しいチームが要るため
5. **監査ログ**：`members`・`member_affiliations`・`mgr_assignments`・`teams` の追加・変更・削除を、今ある `private.record_audit_log()` で監査ログに残す（トリガーを足す。`permissions`・`settings` はもう残っている）
6. **設定値**（2026-11-05・2026-11-07 本人の選択）：設定値の名前を次の2つにする。表は今の `settings` のまま（新しい表は作らない）
   - `karte_call_hour_threshold`：コール時間の線。数（初めは 17）
   - `kpi_workdays`：稼働する土曜の日付の一覧（`"YYYY-MM-DD"` の配列。初めは空の配列）
   - 最初の行は、開発用は架空データ（`fixtures/karte`）で入れる。本番は⑤で入れる

### KPI の持ち越し（`src/features/kpi/`。2026-11-05 本人の選択と区切りの点検）
1. 営業日（`shared/businessDays.ts`）：営業日 ＝ 平日のうち `kpi_holidays` にない日 ＋ `kpi_workdays` にある土曜。設定値 `kpi_workdays` がないときは稼働する土曜なし。取り込み・目標・未達の各画面で、設定値 `kpi_workdays` も読んで渡す
2. 未達（`shared/alerts.ts`）：対象の日が営業日でないとき（入れていない土曜と日曜・休みの日）は、日ごとも月のペースも未達を出さない（目標が未入力の未達も出さない）。その日にかけた数は、次の営業日の月のペースの累計には入る
3. テストを足す：稼働する土曜が営業日の数とあるべきに入ること、入れていない土曜の取り込みで未達が出ないこと、土曜に新しく遅れて月曜も遅れている例で月曜に対応を求めないこと（前の営業日が土曜になる）
4. 小さな2点：`import/api.ts` の `generateAlertsForApprovedImport` の説明のコメント（`ignoreDuplicates` と書いてある）を、今の作り（まとめて insert・23505 は入れ終えた扱い）に直す。未達の一覧で差が0以上のときに「▲+」と記号が二重になる所を「▲」だけにする

### 左メニューと入口（`src/components/layout/AppLayout.tsx`・`src/App.tsx`）
| 入口（ハッシュ） | 左メニューの名前 | 出す人 | 置く箱 |
|---|---|---|---|
| `#/home` | ホーム | リーダー・MGR・代表（メンバーは一般日報の区切りで） | `src/features/home/` |
| `#/karte` | メンバーカルテ | リーダー・MGR・代表 | `src/features/karte/` |
| `#/admin-members` | 名簿の管理 | 管理者の権限がある人 | `src/features/admin/members/` |
| `#/admin-permissions` | 権限の管理 | 管理者の権限がある人と代表 | `src/features/admin/permissions/` |
- 左メニューの並びは、ホームを一番上、メンバーカルテを2番目、管理の2つを一番下にする。ほかの項目の並びは変えない
- 出さない人がアドレスで直接開いたときは、今と同じく「この画面は使えません」と出す（`canAccessRoute`）
- ログインした直後に開く画面：リーダー・MGR・代表はホーム。メンバーは今のまま
- 4つの画面は「準備中」の1枚だけ（見出しと「カルテ第1版の②③で作ります」の1行）。左メニューのテスト（`tests/foundation/`）に4つの出し分けを足す

### 架空データ（`fixtures/karte/`。名前は土台の架空の人と「架空〇〇」だけ）
- 設定値：`karte_call_hour_threshold` ＝ 17、`kpi_workdays` ＝ 架空の稼働する土曜を1日（例：今月の第2土曜）
- KPI の推移：架空チームAの人（リーダーA・メンバーA・メンバーB）について、今日から前の2か月分の営業日の、承認済みの取り込みの記録と日々のKPI（14の時間帯。数字は架空。日によって上下させ、弱い時間帯がわかるように、ある時間帯だけ低めにする）と、2か月分の月の目標。土台の架空の人の行を使い、KPI の架空データ（`fixtures/kpi`）の日付と重ならない日にする
- 退職した人：架空チームAにいて退職した「架空退職メンバー」（退職日は1か月前、所属はその日で閉じる）。その人の承認済みのKPI・ロープレの記録・部下メモ（書いた人はリーダーA）を少し
- 過去の形の記録：ロープレ（`is_legacy` 真・`legacy_source` に架空の元の行）を3件、部下メモ（同じ）を3件。対象はメンバーA
- 消すとき（`remove.mjs`）は、`fixtures/karte` で入れた行だけを消す（ほかの架空データとテスト代表の行は残す）。`cleanup-guard.mjs` は守りのテスト `karte.test.ts` の残り（名前が `guardkt` で始まる人とその記録）を片づける

### この区切り全体の決まり
- カルテ・ホーム（②）は「集める画面」なので、ほかの業務の表を読んでよい（書かない）。計算は `src/features/kpi/shared/` の部品を読み込んで使ってよい（書きかえない）
- 管理の画面（③）は土台の表（名簿・所属・MGRの担当・チーム・権限）だけを読み書きする

守りのテスト（変更禁止）：`tests/guard/permissions.test.ts`、`tests/guard/roleplay.test.ts`、`tests/guard/kpi-memo.test.ts`、`tests/guard/karte.test.ts`

触ってよいファイル・フォルダ：`supabase/migrations/`（新しいファイルを足すだけ）、`fixtures/karte/`、`package.json`（`scripts` に3行足すだけ）、`src/components/layout/AppLayout.tsx`、`src/App.tsx`、`src/features/home/`、`src/features/karte/`、`src/features/admin/`、`src/features/kpi/`（4章の「KPI の持ち越し」だけ）、`tests/foundation/`（左メニューのテストに足すだけ）、`tests/kpi/`、`docs/reports/report_karte-common_v1.md`
触ってはいけないもの：流し込み済みのマイグレーション、`fixtures/`（`karte` のほか）、守りのテスト（`tests/guard/`）、`src/foundation/`、`src/features/roleplay/`・`src/features/memo/`、`docs/`（報告書を除く）、`CLAUDE.md`、`NOTES.md`、`README.md`、ルートの `.gitignore`、`samples/`

## 5. 決めてよいこと／決めてはいけないこと

| 決めてよい | 決めてはいけない（止めて質問する） |
|---|---|
| 変数名・関数名、ファイル内の書き方、トリガーの名前、エラーの文（4章で指定した言葉は入れる） | 4章にない表・列・権限の変更、新しい表、ライブラリの追加 |
| 架空データの数字・日付の細かいところ（4章の条件の中で） | 退職した人の記録を読める人、権限を外せる人、左メニューの出し分け、この計画にない仕様 |

## 6. 完了条件（すべて満たしたら完了）
- [ ] 新しいマイグレーションを `npm run db:push -- --dry-run` で確かめてから流し込んだ（流し込みの前に、本人の許可を取る。Claude Code が SQL を読む）
- [ ] 架空データを `npm run fixtures:karte:load` で入れ、`fixtures:karte:remove` で消せ、もう一度入れられる
- [ ] 左メニューの4つの入口が役割どおりに出て、出さない人は「この画面は使えません」になる（本人が確かめる手順を報告書に書く。役割は `npm run fixtures:dev-role -- 〈leader／member／mgr／admin／ceo〉`。終わったら `ceo` に戻す）
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
