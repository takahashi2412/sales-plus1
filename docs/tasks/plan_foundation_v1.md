# 計画：土台（plan_foundation_v1）

作成日：2026-10-27 ／ 更新：2026-10-28（安全の決まり・Supabase と Microsoft の設定）、2026-10-30（業務ごとに分ける・名前を plan_foundation に）、2026-11-04（流し込みの方法・テスト代表・戻り先・区切りの点検の指摘） ／ 作成：Claude Code ／ 作業：Antigravity
作業用ブランチ：task/foundation
並列：なし
作業するフォルダ：C:\Workspace\apps\sales-plus1-worktrees\foundation\（Claude Code が用意した、この計画専用の作業用フォルダ（ワークツリー）。作業用ブランチもできている）

> この計画に書いていないことは、進めずに質問してください。

## 始める前に本人が済ませること（Antigravity は行わない）

- [x] このPCに Node.js（LTS 版）を入れる
- [x] Supabase のアカウントと、開発用のプロジェクトを作る（無料枠）。メールとパスワードのログインは有効のままにする（守りのテストが使う）
  - 作るときの Security の設定：「データAPIを有効にする」＝オン、「新しいテーブルを自動的に公開する」＝オフ、「自動RLSを有効にする」＝オン。地域は東京（ap-northeast-1）
  - 「新しい利用者の登録を許す（Allow new users to sign up）」＝オン（Microsoft で初めてログインした人が利用者として作られるため。名簿にない人は RLS で何も読めない）
- [x] Microsoft 365（Entra ID）にアプリを登録し（会社のアカウントだけ＝シングルテナント）、Supabase の Azure ログインの設定に、発行された値と会社のテナントの URL を入れる
- [x] Supabase の Authentication → URL Configuration で、Site URL を `http://localhost:5173`、Redirect URLs に `http://localhost:5173/**` を入れる（Microsoft でログインしたあと、手元の画面に戻るため）
- [ ] Microsoft 365（Entra ID）の登録したアプリの「トークン構成」で、オプションの要求（ID の種類）に `email` と `xms_edov` を足す（Supabase が Microsoft のメールアドレスを「確認済み」とみなすため。ないと初めてのログインが「メールが未確認」で止まることがある。止まったときは、開発用だけ Authentication の Confirm email をオフにする）
- [ ] `.env` に次の値を入れる（中身はだれにも見せない。Antigravity にも表示させない）
  - 鍵は Supabase の Project Settings → API Keys の、Legacy API Keys の `anon` と `service_role` にそろえる（新しい形の Publishable と Secret でも動くが、どちらか一方にそろえる）
  - `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（画面が使う）
  - `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`（守りのテストが使う。架空のデータを作って消すため）
  - `SUPABASE_DB_URL`（表を流し込むための接続の文字。Supabase の「Connect」の **Session pooler**（`〜.pooler.supabase.com:5432`、ユーザー名が `postgres.〈プロジェクトの番号〉` のもの）を使う。`[YOUR-PASSWORD]` をデータベースのパスワードに置きかえる。パスワードに記号があるときは URL 用に書きかえる（Claude Code が案内する）。効くのは開発用のプロジェクトだけ）
  - `DEV_LOGIN_EMAIL`（本人の会社のメールアドレス。画面を確かめるとき、架空の名前「テスト代表」の行をこのメールで作るため。Git には入れない）
- [ ] Claude Code が作業用フォルダ（上の「作業するフォルダ」）を用意し、.env を写したら、Antigravity でそのフォルダを開いてから、この計画を渡す

## 0. 最初に必ずやること
1. 今開いているフォルダが、上の「作業するフォルダ」であることを確かめる。違っていたら、作業を始めずに報告する（元のフォルダ C:\Workspace\apps\sales-plus1 では作業しない）
2. `git status` で、作業用ブランチ `task/foundation` にいること、変更が残っていないことを確かめる。違っていたら、作業を始めずに報告する。ブランチは作らない・切り替えない（Claude Code が最新の本線から作ってある）
3. `.env` があるかどうかだけを確かめる（中身は開かない・表示しない）。なければ止めて報告する
4. 今読み込んでいるルールファイル（AGENTS.md・GEMINI.md など）をすべて挙げて報告する。なければ「なし」と報告する
5. `node -v` と `npm -v` を実行し、Node.js が入っていることを確かめる。入っていなければ止めて報告する

## 1. 目的（なぜやるか）
アプリ全体の土台（Microsoft 365 でのログイン、名簿、権限）を作り、「役割ごとに見える範囲が設計どおりか」をデータベースの段階で確かめる。ここが全部の業務の土台になり、いちばん技術の不安が大きい所なので、ほかの業務より先に小さく確かめる。

## 2. やること
1. プロジェクトの土台を作る：React＋Vite（TypeScript）。テストの道具は Vitest。Supabase とつなぐ部品は `@supabase/supabase-js`。Supabase の道具（CLI）は `npx supabase` で使う（グローバルに入れない）
   - 作業用フォルダは空ではない（CLAUDE.md・NOTES.md・README.md・.gitignore・docs/・tests/ がある）。Vite の雛形（`npm create vite`）をこのフォルダで直接作らない。雛形はフォルダの外で作って要るファイルだけ写すか、手で作る。既にあるファイル・フォルダを上書き・削除しない（特にルートの `.gitignore`。上書きされると `.env` が Git に入ってしまう）
   - `package.json` の scripts の `test` は `vitest run`（監視モードにしない）。流し込み・架空の名簿の出し入れも scripts に置く（例：`db:push`・`fixtures:load`・`fixtures:remove`）。`.env` を読む補助のプログラムは `supabase/` か `fixtures/foundation/` に置き、`node --env-file=.env` で動かす（ライブラリを足さない）
   - `src/` は、土台（ログイン・名簿・権限。例：`src/foundation/`）と、業務ごとのフォルダ（`src/features/〈業務〉/`。ロープレ以降に足す）に分けられる形にする（7章「業務ごとに分ける」）。今回作るのは土台だけ
2. 表と権限を、SQL のファイル（マイグレーション）で `supabase/migrations/` に書き、開発用のプロジェクトに流し込む（4章の表と権限）
   - 流し込みは `npx supabase db push --db-url` に、`.env` の `SUPABASE_DB_URL` の値を渡して行う（値は画面やログに出さない。コマンドに直接書かず、`.env` から読む）。`supabase login`（アカウントへのログイン）は使わない
   - `npx supabase init` はしてよい（`supabase/config.toml` と `supabase/.gitignore` ができる。ルートの `.gitignore` は変えない）。流し込みの確認を聞かれたら、内容を報告書に書いてから進める
   - このPCには Docker がない。Docker が要る道具（`supabase start`・手元での `db reset`・`db diff`・`gen types`）は使わない。型は手で書く
   - 一度流し込んだマイグレーションのファイルは直さない。直しは新しいマイグレーションのファイルで行う
3. 画面：Microsoft 365 でログインする画面と、ログインしたあとに「自分の名前・役割・今のチーム」と「自分が見られる名簿の一覧」を出す画面だけを作る
   - ログインは `supabase.auth.signInWithOAuth` の `provider: 'azure'` で、`scopes: 'email'` を付ける（メールアドレスを受け取るため）。戻り先は `window.location.origin`
   - 画面の開発用サーバーはポート 5173 に固定する（`strictPort`。Supabase の戻り先の設定と合わせるため）
   - ログインに使ったメールアドレスが名簿（members）にないときは、「名簿に登録されていません。管理者に連絡してください」と出して、何も見せない
4. 守りのテスト `tests/guard/permissions.test.ts`（Claude Code が書いて本線に置いたもの）が通るようにする。テストは変えない
   - このテストは `process.env` から `SUPABASE_URL`・`SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY` を読む。Vitest の設定（`vitest.config.ts` など）で `.env` を読み込ませる（例：Vite の `loadEnv(mode, process.cwd(), '')` の結果を `test.env` に渡す。3つ目を `''` にしないと `VITE_` の付いた値しか読まれない）
   - テストは1回で8人がパスワードでログインする。Supabase のログインには回数の制限があるので、続けて何回も回して「429」（回数の超過）が出たら、5分ほど待ってから回し直す（作りの誤りと取り違えない）
   - テスト自体の書き間違い（読み込みの書き方・型など）で動かないときは、テストを直さずに止めて、どこがどう動かないかを報告する。Claude Code が直す
5. 画面で確かめるための架空の名簿を `fixtures/foundation/` に置き、開発用のプロジェクトに入れる手順（またはプログラム）を用意する。名前は「メンバーA」のような架空のものだけ
   - 本人が自分の Microsoft のアカウントで確かめられるように、`.env` の `DEV_LOGIN_EMAIL` のメールアドレスで、架空の名前「テスト代表」・役割 `ceo` の行を1つ作る。メールアドレスはファイルに書かず、`.env` から読む
   - その行だけを消す手順も用意する（消したあとに同じアカウントでログインすると「名簿に登録されていません」になることを、本人が確かめるため）。消したあと、もう一度作ればまた見えるようにする（結び付けは下の4章のとおり、ログインのたびに行う）
6. `.env.example` に、要る値の名前だけを書く（値は書かない）

## 3. やらないこと
- 監査ログ・一覧（マスタ）・設定値の表（次のロープレで作る）
- ロープレなど、業務の表と画面（ロープレ以降）
- 左メニュー・画面の枠などの共通の部品のつくり込み（ロープレの先頭で作る）。今回は最小の2画面だけ
- 画面を置く場所（ホスティング）への公開
- 本物のデータ・本物の社員の名前を入れること

## 4. 仕様

参照：設計書 `docs/design/project-dashboard_v26.html` の「概要（使う人とできること）」「1-2 作り方の形」「5 データの設計図（teams・members・member_affiliations・mgr_assignments・permissions）」「9 画面と権限」（「ログインと安全の決まり」を含む）。権限の決まりは NOTES.md の「まとまり2：権限」。

### 表（名前と項目はこのとおりにする。守りのテストがこの名前を使う）

| 表 | 項目 |
|---|---|
| `teams` | `id`（uuid）、`name` |
| `members` | `id`（uuid）、`auth_user_id`（uuid・ログインの利用者と結ぶ。最初は空でよい）、`email`（一意）、`name`、`role`（`member`／`leader`／`mgr`／`ceo` のどれか）、`goes_to_sales`（営業に出るか。真偽）、`hired_on`（日付）、`retired_on`（日付・空なら在籍） |
| `member_affiliations`（所属の履歴） | `id`、`member_id`、`team_id`、`base`（拠点）、`start_date`、`end_date`（空なら今も所属） |
| `mgr_assignments`（MGRの担当チーム） | `id`、`mgr_member_id`、`team_id`、`start_date`、`end_date`（空なら今も担当）、`assigned_by` |
| `permissions`（役職とは別の権限） | `id`、`member_id`、`kind`（`admin`＝管理者／`talk_owner`＝トーク責任者）、`granted_by`、`granted_at`、`revoked_by`、`revoked_at`（空なら有効） |

- ログインした人の `members` の行は、ログインのメールアドレスと `members.email` で結ぶ。比べるときは両方を小文字にする（`lower()`。Microsoft は大文字の混ざったアドレスを返すことがある）。ログインのたびに、`auth_user_id` が空の行にだけ結び付ける（初めてのログインのときだけ動く仕組みにしない。行を消して作り直したあとも結べるように）。ほかの人の行に結び付かないこと
- 利用者の登録（`auth.users`）を、名簿にないからといって拒む仕組みは作らない（守りのテストは、利用者を作ってから名簿の行を作る）
- 「今日」は日本時間の日付（`(now() at time zone 'Asia/Tokyo')::date`）。データベースの `current_date` は世界標準時なので使わない
- 「今の所属」＝ `member_affiliations` のうち、今日が `start_date` 以上で、`end_date` が空か今日以上の行
- 「今の担当」＝ `mgr_assignments` のうち、同じ条件の行
- 「有効な権限」＝ `permissions` のうち、`revoked_at` が空の行

### 権限（行ごとの読み書きの決まり。データベースの段階で絞る）

| だれが | `members` を読める範囲 | 書ける |
|---|---|---|
| ログインしていない | なし | なし |
| メンバー（`member`） | 自分と、今の所属が同じチームの人（チーム内の順位を名前つきで見せるため） | なし |
| リーダー（`leader`） | 今の所属が同じチームの人 | なし |
| MGR（`mgr`） | 自分と、今担当しているチームに今所属している人 | なし |
| 代表（`ceo`） | 全員 | なし（今回） |
| 管理者の権限がある人（`admin` が有効） | 全員 | `members`・`member_affiliations`・`mgr_assignments` の追加と変更 |

- `permissions` の追加と取り消しは、代表と、管理者の権限がある人だけ
- `permissions` を読めるのは、代表と管理者の権限がある人は全員分、ほかの人は自分の行だけ（2026-11-04 本人の選択）。守りのテストでは、代表が権限を足したあとにその行を読み返す
- 役割と権限の判定は、毎回表を読んで行う。ログインの証明書（JWT）に役割を入れる作り（Custom Access Token Hook など）にしない（取り消しがすぐに効かなくなり、管理画面での設定も要るため）
- 判定に使う関数は `security definer` にして、`set search_path = ''` を付ける。外から呼べる場所（`public`）に置かない（例：`private` のスキーマ）。`authenticated` に `execute` を明示して許可し、`anon` と `public` からは外す。決まり（RLS）の中で同じ表を直接読み返して、決まりが自分を呼び続けないようにする
- `member_affiliations`・`mgr_assignments`・`teams` も、上の `members` と同じ範囲で読める（自分が読める人の所属・担当だけ）。迷ったら止めて質問する
- 削除はしない（このあとの区切りで論理削除を入れる）

### 安全の決まり（2026-10-28 追加）
開発用のプロジェクトは「新しいテーブルを自動的に公開する」をオフ、「自動RLSを有効にする」をオンにしてある。そのため、次のとおりにする。
1. すべての表で RLS（行ごとの読み書きの決まり）をオンにする。マイグレーションの中でも `alter table ... enable row level security` を明示する（自動の設定に頼らない）
2. 表ごとの許可（GRANT）を、マイグレーションの SQL のファイルに明示する
   - `authenticated`（ログインした人）：必要な操作だけ許可し、行の範囲は RLS で絞る
   - `service_role`（守りのテストが架空のデータを作って消すため）：読み書きと削除を許可する
   - `anon`（ログインしていない人）：何も許可しない
3. `service_role` の鍵と `SUPABASE_DB_URL` は画面のコード（`src/`）で使わない。`VITE_` を付けた名前にしない（`VITE_` の付いた値は画面に埋め込まれ、だれでも見られるため）
4. Supabase の管理画面の Security Advisor（安全の点検）は、本人のアカウントでしか開けない。報告書に「Security Advisor の確認が要る」と書く（本人が開いて写しを送り、Claude Code がレビューで確かめる。警告が出たら、直しを Claude Code から頼む）。無料枠では消せない警告（漏れたパスワードの確認 Leaked Password Protection など）は、残ってよい

守りのテスト（変更禁止）：`tests/guard/permissions.test.ts`

触ってよいファイル・フォルダ：`package.json`、`package-lock.json`、`vite.config.ts`、`vitest.config.ts`（要るなら）、`tsconfig*.json`、`eslint.config.js`（要るなら）、`index.html`、`public/`（要るなら）、`src/`、`supabase/`（`supabase/.gitignore` を含む）、`fixtures/foundation/`、`tests/` の中で `tests/guard/` 以外、`.env.example`、`docs/reports/report_foundation_v1.md`
触ってはいけないもの：`tests/guard/`、`docs/`（報告書を除く）、`CLAUDE.md`、`NOTES.md`、`README.md`、`.gitignore`、`samples/`

## 5. 決めてよいこと／決めてはいけないこと

| 決めてよい | 決めてはいけない（止めて質問する） |
|---|---|
| 変数名・関数名、ファイル内の書き方、フォルダの中の分け方 | 4章の表の名前・項目、権限の範囲 |
| `src/` の中の作り、ログイン画面の見た目（Rush up 資料デザインに従う） | 2章に書いたもの以外のライブラリの追加 |
| 架空の名簿の中身（架空の名前だけ） | 画面を置く場所、本物のデータの扱い、守りのテストの変更 |

## 6. 完了条件（すべて満たしたら完了）
- [ ] `npm test` で、守りのテスト `tests/guard/permissions.test.ts` がすべて通る
- [ ] Microsoft 365 でログインすると、自分の名前・役割・今のチームと、見られる名簿の一覧が出る（本人が確かめる手順を報告書に書く）
- [ ] 名簿にないメールアドレスでログインすると、何も見えない（「テスト代表」の行を消して、同じアカウントで確かめられる手順を報告書に書く）
- [ ] 表と権限はすべて `supabase/migrations/` の SQL のファイルにあり、管理画面だけで作った設定がない（あれば報告書に書く）
- [ ] 4章「安全の決まり」の1〜3を守っている（すべての表で RLS がオン、GRANT を明示し `anon` には許可なし、`service_role` の鍵が `src/` になく `VITE_` も付いていない）
- [ ] 報告書に「Security Advisor の確認が要る」と書いた（警告が0件かは、本人と Claude Code がレビューで確かめる）
- [ ] すべてのテストが通る
- [ ] `git ls-files` に `.env` が出ない（Git に入っていない）。ルートの `.gitignore`・README.md・CLAUDE.md・NOTES.md・docs/ を変えていない
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
1. 作業結果を `docs/reports/report_foundation_v1.md` に、下の書式で書く
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
- Security Advisor の確認が要るかどうか（表や権限を変えたので、この計画では要る）
- 0-4 で報告した、読み込んでいたルールファイル
- 気になった点
