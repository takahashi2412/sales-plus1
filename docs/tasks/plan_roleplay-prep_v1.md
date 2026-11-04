# 計画：ロープレの並列の前の準備：上席の判定から自分を外す・見る人の情報の部品（plan_roleplay-prep_v1）

作成日：2026-11-04 ／ 作成：Claude Code ／ 作業：Antigravity
作業用ブランチ：task/roleplay-prep
並列：なし（表の直しと共通の部品なので、②plan_roleplay-record と③plan_roleplay-talks の並列の前に1本で作る）
作業するフォルダ：C:\Workspace\apps\sales-plus1-worktrees\roleplay-prep\（Claude Code が用意した、この計画専用の作業用フォルダ（ワークツリー）。作業用ブランチもできている）

> この計画に書いていないことは、進めずに質問してください。

## 0. 最初に必ずやること
1. 今開いているフォルダが、上の「作業するフォルダ」であることを確かめる。違っていたら、作業を始めずに報告する（元のフォルダ C:\Workspace\apps\sales-plus1 では作業しない）
2. `git status` で、作業用ブランチ `task/roleplay-prep` にいること、変更が残っていないことを確かめる。違っていたら、作業を始めずに報告する。ブランチは作らない・切り替えない（Claude Code が最新の本線から作ってある）
3. `.env` があるかどうかだけを確かめる（中身は開かない・表示しない）。なければ止めて報告する
4. 今読み込んでいるルールファイル（AGENTS.md・GEMINI.md など）をすべて挙げて報告する。なければ「なし」と報告する
5. `npm install` をしてから `npx vitest run tests/guard/permissions.test.ts tests/foundation` を回し、土台の守りのテストと画面のテストが通ることを確かめる（通らなければ、作業を始めずに報告する）。`tests/guard/roleplay.test.ts` はここでは回さない（Claude Code が足した2つの確かめ＝「ロープレの記録：自分を実行者にして、読める課員の分だけ足せる」の中の、自分を課員にした記録と、「テーマ表：上席でも自分自身のテーマは足せず、卒業にもできない」は、この計画を作り終えるまで落ちる。作り終えたら全部通す）
6. ログインの回数の上限：守りのテストは、1回でテスト用の人が 19 回ログインする。開発用の Supabase は、ログインが5分に30回までのことがある。429（回数の上限のエラー）や「rate limit」が出たら、5分待ってから回す。続けて何度も回さない（直したあとにまとめて1回）

## 1. 目的（なぜやるか）
ロープレ①の判定 `private.can_supervise_member` が自分自身を外していないので、リーダーが自分のテーマを足したり卒業にしたりできてしまう。また、自分を課員にしたロープレを書けてしまう。これをデータベースで直す。あわせて、②③の画面が「見ている人の役割・今のチーム・MGR の担当・トーク責任者かどうか・書ける課員」を同じ計算で使えるように、ロープレの箱の共通の部品（`shared/`）に足す（並列の2本が同じ計算を別々に書かないため）。

## 2. やること
1. 新しいマイグレーション `supabase/migrations/20261104000004_roleplay_supervise_excludes_self.sql` を足す（流し込み済みのファイルは直さない）
   - `private.can_supervise_member(target uuid)` を `create or replace` で作り直し、`target = private.current_member_id()`（自分自身）のときは偽にする。ほかの判定はロープレ①のまま（代表は真、リーダーは今同じチーム、MGR は担当のチーム、管理者の権限では真にしない、メンバーは偽）。`security definer`・`set search_path = ''` もそのまま
   - `roleplays` の追加と変更の決まり（`roleplays_insert_policy`・`roleplays_update_policy` の `with check`）に、`member_id <> private.current_member_id()`（実行者と課員は別の人）を足す。ポリシーは `drop policy if exists` のあと `create policy` で作り直す。ほかの条件はロープレ①のまま
   - 引数の名前 `target` は変えない（変えると Postgres が作り直しを断る）。`create or replace` は今の実行の許可を引き継ぐが、読みやすいよう `revoke`／`grant` を ①と同じ形で書き直してよい
   - これで、リーダー・MGR は自分自身のテーマを足せず、卒業にもできない（自分の上席＝担当MGR・代表が行う）。代表自身のテーマとロープレは、だれも書けなくなる（代表の上席はいないため。それでよい）。ほかの表・権限・関数は変えない
2. `src/features/roleplay/shared/viewer.ts` を足し、`shared/index.ts` から export する
   - 読み取りの関数と計算の関数を分ける。読み取りの関数は、①の `api.ts` と同じく `client: SupabaseClient = supabase`（土台の `src/foundation/supabaseClient`。画面用の鍵）を受け取る形にする。日本時間の「今日」と期間の判定は、土台の `src/foundation/directory.ts` の `getTodayJstDateString` と `isActivePeriod` を使う
   - 自分の行は、RLS に頼らず明示して絞る（代表や管理者の権限がある人は、ほかの人の権限・所属・担当も読めるため）：名簿はログインの利用者 id と `auth_user_id` を照らして探し、権限・所属・MGR の担当は自分の名簿の id で絞る
   - `fetchViewerContext(client?)`：ログインしている人の情報を返す。返すもの（型 `ViewerContext`）：自分の名簿の id、役割（member／leader／mgr／ceo）、今のチームの id、MGR として今担当しているチームの id の一覧、トーク責任者の権限があるか（自分の行で `kind = 'talk_owner'`・`revoked_at` が空）、代表かどうか。自分の行が見つからない（名簿にない・退職した）ときは `null` を返す。読み取りのエラーは throw する
     - 今のチームは、データベースの `private.member_team_now` と同じ1つ：今日が開始日〜終了日の中の所属のうち、開始日がいちばん新しいもの（土台の名簿の画面のように、全部をつなげない）
   - `fetchWritableMembers(viewer, client?)`：ロープレを書ける課員の一覧（名簿の id・名前・今のチームの id）。読めた行をそのまま返さず、役割で分けて絞る（管理者の権限がある人は全員を読めるため）：リーダー・メンバーは今同じチームの人、MGR は担当しているチームに今所属している人、代表は全員。どれも自分を除き、退職日（`retired_on`）が今日より前の人を除く。管理者の権限では広げない
   - 計算の補助の関数（データベースに触らない。読み取りの関数がこれを使う）：`buildViewerContext(rows, today)`（読んだ行から `ViewerContext` を作る）、`pickWritableMembers(viewer, members, affiliations, today)`（書ける課員を選ぶ）
   - ボタンを出すかの計算だけの関数（データベースに触らない）。判定は「配列があるか」ではなく役割で分ける（データベースは、MGR の担当を役割が mgr のときしか見ない）。データベースの決まりと同じ範囲にする
     - `canSuperviseMember(viewer, target: { id: string; teamId: string | null })`：自分なら偽。代表は真。リーダーは今のチームが target と同じ。MGR は target のチームを担当している。メンバーは偽
     - `canMoveTalkToTrial(viewer, talkTeamId: string | null)`：**チームつきのトーク**は、リーダーで今のチームが同じ人、または今そのチームを担当している MGR だけが真（データベースの `is_supervisor_of_team` と同じ。代表とトーク責任者は偽）。**チームなしのトーク**は代表だけが真
     - `canMoveTalkToStandard(viewer)`：トーク責任者だけ
     - `canAddTalkFromList(viewer, teams)`：リーダー・MGR・トーク責任者・代表で、かつ `selectableTalkTeams` で選べるもの（チームなしを含む）が1つ以上あるとき
     - `canEditTalk(viewer, talk: { createdBy: string; status: string; teamId: string | null })`：作った人は確認待ちの間だけ。チームの上席（`canMoveTalkToTrial` と同じリーダー・担当MGR）・トーク責任者・代表はいつでも
     - `canCreateSeminar(viewer)`：リーダー・MGR だけ（代表は偽）
     - `selectableTalkTeams(viewer, teams: { id: string; name: string }[])`：返す形は `{ allowNoTeam: boolean; teamIds: string[] }`。メンバー・リーダーは今のチームだけ（なければ空）、MGR は担当のチーム、代表は `allowNoTeam` が真で、`teams` のすべて（代表は teams の表をすべて読める）。トーク責任者でも、役割がメンバーなら今のチームだけ
   - 型（`ViewerContext` など）は `shared/types.ts` に足す
3. 計算の補助の関数とボタンの計算だけの関数のテストを `tests/roleplay/shared/viewer.test.ts` に書く（架空のデータで。役割ごと、自分自身、チームつき・チームなしのトーク、代表がチームつきのトークを試行中にできないこと、所属が2つ重なる人、退職した人を除くこと、管理者の権限で広がらないこと）
4. 守りのテスト（`tests/guard/`）を通す。Claude Code が `tests/guard/roleplay.test.ts` に、自分自身のテーマ・自分を課員にした記録の2件を足してある

## 3. やらないこと
- 画面の中身（②③で作る）。`src/App.tsx`・入口のファイル（`record/`・`talks/`・`seminar/`）は変えない
- 1の直しのほかの表・権限・関数の変更
- 架空データの変更

## 4. 仕様
参照：ロープレ①の計画ファイル `docs/tasks/plan_roleplay-common_v1.md` の2-1と4章（関数・表・権限）、`supabase/migrations/20261104000003_roleplay_common_schema_and_rls.sql`（今の `can_supervise_member` と `roleplays` のポリシー）、①の報告書 `docs/reports/report_roleplay-common_v1.md`

### 決まり
- 権限は、データベースの段階（RLS）で絞る。`viewer.ts` の計算だけの関数は、画面でボタンを出すかを決めるためのもので、データベースと同じ範囲にする（画面だけで絞った気にならない）
- 指導の記録の判定に、管理者の権限（`private.is_admin()`）と `private.can_read_member()` を使わない（2026-11-04 本人の選択）
- 管理用の鍵（`service_role`）は `src/` で使わない

守りのテスト（変更禁止）：`tests/guard/` のすべて

触ってよいファイル・フォルダ：`supabase/migrations/20261104000004_roleplay_supervise_excludes_self.sql`（新規）、`src/features/roleplay/shared/`（`viewer.ts` を足す、`index.ts` と `types.ts` に足す。今ある関数は変えない）、`tests/roleplay/shared/`（新規）、`docs/reports/report_roleplay-prep_v1.md`
触ってはいけないもの：流し込み済みのマイグレーションのファイル、`supabase/config.toml`、`fixtures/`、`src/foundation/`（使うだけ）、`src/components/`、`src/App.tsx`、`src/index.css`、`src/features/roleplay/record/`・`talks/`・`seminar/`、`package.json`、`tests/guard/`、`tests/foundation/`、`docs/`（報告書を除く）、`CLAUDE.md`、`NOTES.md`、`README.md`、ルートの `.gitignore`、`samples/`
- `npm install` で `package-lock.json` が変わったときは、コミットせずに報告する（部品は足さないので、変わらないはず）

## 5. 決めてよいこと／決めてはいけないこと

| 決めてよい | 決めてはいけない（止めて質問する） |
|---|---|
| 変数名、`viewer.ts` の中の書き方、2-2で名前を決めていない補助の関数 | 2-1の直しのほかの表・権限の変更、2-2の関数の名前と範囲、ライブラリの追加、この計画にない仕様 |

## 6. 完了条件（すべて満たしたら完了）
- [ ] 2-1の直しが `supabase/migrations/20261104000004_roleplay_supervise_excludes_self.sql` にあり、`npm run db:push -- --dry-run` のあと `npm run db:push` で流し込み済み
- [ ] `npm run db:push -- --dry-run` で流す予定が `20261104000004` の1本だけだったことを、報告書に書いた
- [ ] `shared/viewer.ts` があり、`shared/index.ts` から export している。`shared/` の今ある関数（`api.ts`・`types.ts` の今の型）は変えていない
- [ ] 計算の補助の関数とボタンの計算だけの関数のテストがある
- [ ] 報告書の「本人が画面で確かめる手順」には、画面の変更がないこと、`npm run dev` で今の画面が開くことだけを書く（役割ごとの確かめは②③のあとに本人が行う）
- [ ] `npm test` で、守りのテスト（土台とロープレ）とほかのテストがすべて通る（ログインの回数の上限は 0-6）
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
1. 作業結果を `docs/reports/report_roleplay-prep_v1.md` に、下の書式で書く
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
