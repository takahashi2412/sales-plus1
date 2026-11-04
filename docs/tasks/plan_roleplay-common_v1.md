# 計画：ロープレ①：土台の追加・ロープレと研修の表・共通の部品（plan_roleplay-common_v1）

作成日：2026-11-04 ／ 仕上げ：2026-11-04（土台に合わせて。区切りの点検のあと渡す） ／ 作成：Claude Code ／ 作業：Antigravity
作業用ブランチ：task/roleplay-common
並列：なし（この計画が本線に入ってから、②plan_roleplay-record と③plan_roleplay-talks を2本の並列で始める）
作業するフォルダ：C:\Workspace\apps\sales-plus1-worktrees\roleplay-common\（Claude Code が用意した、この計画専用の作業用フォルダ（ワークツリー）。作業用ブランチもできている）

> この計画に書いていないことは、進めずに質問してください。

## 0. 最初に必ずやること
1. 今開いているフォルダが、上の「作業するフォルダ」であることを確かめる。違っていたら、作業を始めずに報告する（元のフォルダ C:\Workspace\apps\sales-plus1 では作業しない）
2. `git status` で、作業用ブランチ `task/roleplay-common` にいること、変更が残っていないことを確かめる。違っていたら、作業を始めずに報告する。ブランチは作らない・切り替えない（Claude Code が最新の本線から作ってある）
3. `.env` があるかどうかだけを確かめる（中身は開かない・表示しない）。なければ止めて報告する
4. 今読み込んでいるルールファイル（AGENTS.md・GEMINI.md など）をすべて挙げて報告する。なければ「なし」と報告する
5. `npm install` をしてから `npx vitest run tests/guard/permissions.test.ts tests/foundation` を回し、土台の守りのテストと画面の計算のテストがすべて通ることを確かめる（通らなければ、作業を始めずに報告する）。`tests/guard/roleplay.test.ts` は、この計画で作る表がまだないので、始める前は落ちてよい（作り終えたら通す）

## 1. 目的（なぜやるか）
ロープレの区切りの先頭で、2本の並列（②記録とテーマ表、③トーク一覧と研修の記録）がぶつからないように、表・権限・架空データ・画面の切り替えと左メニュー・共通の部品・デザインのお手本を、先に1本で作る。あわせて、退職した人が読めないように土台の判定を直す。

## 2. やること
1. 新しいマイグレーションのファイルを `supabase/migrations/` に足す（番号は `20261104000002` より後。流し込み済みのファイルは直さない）
   - 土台の直し：`private.current_member_id()` を、退職日（`retired_on`）が今日（`private.today_jst()`）より前の人には何も返さない（null）ように作り直す。これで退職した人は、ログインできても名簿にない人と同じく何も読めない。退職した人の名簿の行と記録は消えない（代表は読める。リーダー・MGR からは、所属が閉じるので見えない。これは土台の決まりのまま）
   - 指導の記録用の判定を2つ足す（`private` のスキーマ。`security definer`・`set search_path = ''`・`authenticated` に `execute`、`anon` と `public` から外す。土台の関数と同じ作り）
     - `private.can_supervise_member(target uuid)`：代表なら真。リーダーなら、今の所属が target と同じチーム。MGR なら、今担当しているチームに target が今所属している。**管理者の権限では真にしない**。メンバーは偽
     - `private.is_supervisor_of_team(team uuid)`：リーダーで今その team に所属している、または MGR で今その team を担当している
   - 土台の追加の表（`masters`・`settings`・`audit_logs`）と、ロープレと研修の表（4章）。すべてに RLS と GRANT を明示する
   - 監査ログ：`masters`・`settings`・`permissions` の追加・変更・削除を、トリガー（`security definer` の関数を `private` に置く）で `audit_logs` に残す
2. 架空データを `fixtures/roleplay/` に置き、`package.json` の scripts に `fixtures:roleplay:load`・`fixtures:roleplay:remove` を足す（`node --env-file=.env` で動かす）。土台の `npm run fixtures:load` を先に入れてから使う。入れるもの：テーマ一覧（段階1〜6の架空の例）、テーマ表、ロープレの記録、トーク（確認待ち・試行中・標準を1つ以上ずつ）、研修と参加者、一覧（場面・業種・リストの種類の言葉）、設定値（ロープレの注意30分・14日、卒業の回数2、確認までの日数14）、架空のトーク責任者の権限（土台の架空の人のうち1人に `talk_owner`。権限を与える画面はカルテ第1版で作るため）
3. 画面の切り替えと画面の枠を作る（部品は足さず、アドレスの「#」で切り替える。例：`#/roleplay`）：上の帯・左メニュー・中身の場所。左メニューは「名簿の確認」「ロープレ」「テーマ表」「トーク一覧」「研修の記録」。②③の画面は、入口のファイル（`src/features/roleplay/record/index.tsx`・`talks/index.tsx`・`seminar/index.tsx`。中身は「準備中」と出すだけ）を①で作り、②③がそれぞれの中身を作る
4. 共通の部品を作る：ボタン・入力欄・選ぶ欄・表・タグ・知らせの枠・日付の表示（`src/` の共通の場所。名前は任せる）と、ロープレの箱の中で共通に使うもの（表の読み書きの部品・型。`src/features/roleplay/shared/`）
5. デザインのお手本：土台の「名簿の一覧」の画面を、共通の枠と部品で作り直す。②③はこの画面を見本にする
6. `supabase/config.toml` の `project_id = "foundation"` を `"sales-plus1"` に直す
7. 守りのテスト（4章）を通す

## 3. やらないこと
- ロープレの記録・テーマ表・卒業の知らせの画面の中身（②で作る）、トーク一覧・研修の記録の画面の中身（③で作る）
- 設定値・監査ログ・名簿・権限の画面（週間教育・カルテ第1版の区切りで作る）
- ホーム（今日やること）への知らせの集約（カルテ第1版で作る）
- KPI・週間教育の表とのつながり（ロープレの「課題/目的」「翌日の結果」は、列だけ作って空でよい）
- 本物のトーク・本物の過去の記録の取り込み

## 4. 仕様
参照：設計書 `docs/design/project-dashboard_v27.html` の「5 データの設計図」の「ロープレの形（v15）」「変わりやすいものは一覧と設定値で持つ（v21）」、「9 画面と権限」（「ログインと安全の決まり」の「指導の記録を読める範囲」を含む）、「書く画面の決まり」。図解 `docs/design/roleplay_v1.html`。表と列の名前は、この計画が正（守りのテストがこの名前を使う）

### 表（名前と項目はこのとおりにする）
| 表 | 項目 |
|---|---|
| `masters` | `id`（uuid）、`kind`（`scene`＝場面／`industry`＝業種／`list_type`＝リストの種類。のちの区切りで種類を足す）、`name`、`sort_order`（整数）、`is_active`（真偽。初めは真。消すときは偽） |
| `settings` | `key`（主キー。例：`roleplay_alert_minutes`）、`value`（jsonb）、`reason`（変えた理由。必須）、`updated_by`（member の id。members への鍵にはしない）、`updated_at` |
| `audit_logs` | `id`、`actor_member_id`（変えた人。members への鍵にはしない。管理用の鍵で変えたときは空）、`action`（`insert`／`update`／`delete`）、`table_name`、`row_id`（text）、`before`（jsonb）、`after`（jsonb）、`created_at` |
| `roleplay_themes` | `id`、`no`（テーマ番号）、`stage`（1〜6）、`name`、`kind`（`apo`＝アポ／`sales`＝営業）、`pass_example`、`is_active` |
| `member_themes` | `id`、`member_id`（members）、`theme_id`（roleplay_themes）、`kind`（テーマと同じ。下の一意の決まりのため）、`started_on`、`pass_line`、`status`（`practicing`＝練習中／`graduated`＝卒業）、`graduated_on`、`check_on`、`created_by`（members）、`hidden_at`（見えなくした日時。空なら見える）。練習中はアポと営業で1つずつまで（`member_id`・`kind` の組で、`status = 'practicing'` かつ `hidden_at` が空の行は1つまで） |
| `roleplays` | `id`、`date`、`runner_member_id`（実行者＝書いた人。members）、`member_id`（課員。members）、`time_slot`、`kind`（`apo`／`sales`）、`theme_id`、`used_talk_id`（talks。空でよい）、`minutes`、`homework_result`（`o`／`d`／`x`＝○△×。空でよい）、`repeat_count`、`pass_result`（`o`／`d`／`x`）、`next_homework`、`fixed_point`（今日直した点。送るときは必須）、`note`、`purpose`（今回は空）、`result_ap`・`result_rate`（今回は空）、`submitted_at`（送った日時。空なら書きかけ）、`hidden_at` |
| `talks` | `id`、`code`（`OUT-`／`SC-` で始まる）、`scene_id`・`industry_id`・`list_type_id`（masters。空でよい）、`their_words`、`wording`、`aim`、`team_id`（作った人の今のチーム。teams）、`created_by`（members）、`status`（`pending`＝確認待ち／`trial`＝試行中／`standard`＝標準）、`hidden_at`。練習回数と合格率は表に持たず、roleplays から数える |
| `seminars` | `id`、`date`、`theme`、`lecturer`、`minutes`、`content`、`created_by`（members）、`hidden_at` |
| `seminar_members` | `seminar_id`（seminars）、`member_id`（members）。2つの組が主キー |

### 権限（RLS。「名簿にいる人」＝ `private.current_member_id()` が空でない人。退職した人は含まない）
| 表 | 読める | 書ける |
|---|---|---|
| `masters`・`settings`・`roleplay_themes` | 名簿にいる人 | 管理者の権限がある人だけ（`private.is_admin()`。追加・変更。画面は後の区切り） |
| `audit_logs` | 代表と、管理者の権限がある人 | ログインした人はだれも書けない（トリガーだけが書く） |
| `roleplays` | 書いた人（`runner_member_id` が自分）は書きかけも。送った記録（`submitted_at` あり）は、課員本人（`member_id` が自分）と、`private.can_supervise_member(member_id)` が真の人 | 追加：名簿にいる人が、自分を実行者にして、`private.can_read_member(member_id)` が真の課員の分だけ。変更：書いた人だけ。消す＝`hidden_at` を入れる（書いた人だけ） |
| `member_themes` | 課員本人と、`private.can_supervise_member(member_id)` が真の人 | 追加・変更：`private.can_supervise_member(member_id)` が真の人（代表・リーダー・MGR） |
| `talks` | 名簿にいる人は `trial` と `standard`。`pending` は、作った人・`private.is_supervisor_of_team(team_id)` が真の人・トーク責任者の権限がある人（`private.has_active_permission('talk_owner')`）・代表 | 追加：名簿にいる人が `status = 'pending'`・`created_by` が自分の行だけ（ロープレから新しい言い方を入れるため）。状態の変更：`pending` → `trial` は `private.is_supervisor_of_team(team_id)` が真の人、`trial` → `standard` はトーク責任者の権限がある人だけ（変更の前と後を比べるトリガーで確かめる）。中身の直し：作った人・そのチームのリーダーと担当MGR・トーク責任者 |
| `seminars`・`seminar_members` | 参加した本人（`seminar_members` に自分がいる研修）と、リーダー・MGR・代表 | リーダー・MGR（追加と、自分が作った研修の変更） |

- 指導の記録（`roleplays`・`member_themes`）を読む範囲に、`private.is_admin()` を使わない（管理者の権限では広げない。2026-11-04 本人の選択）
- ログインした人（`authenticated`）には、どの表も削除（DELETE）の許可を出さない。消すのは `hidden_at` や `is_active` で見えなくするだけ
- 管理用の鍵（`service_role`）には、すべての表の読み書きと削除を許す（守りのテストと架空データの出し入れのため）
- ログインしていない人（`anon`）には、何も許さない

### この区切り全体の決まり
- 業務ごとに分ける：ロープレの箱のプログラムは `src/features/roleplay/` の中に置き、記録とテーマ表は `record/`、トーク一覧は `talks/`、研修の記録は `seminar/`、ロープレの箱の中で共通に使うものは `shared/`（①だけが作る）に分ける（並列の2本がぶつからないように）
- 権限は、データベースの段階（RLS）で絞る。判定には土台の関数と、この計画で足す2つの関数だけを使う
- 削除はしない。消す操作は「見えなくする」印にする
- 画面は Rush up 資料デザイン（7章）。PC とスマホの両方で使える形（レスポンシブ）にする

守りのテスト（変更禁止）：`tests/guard/permissions.test.ts`（土台）、`tests/guard/roleplay.test.ts`（ロープレ。上の権限の表、トークの2段階の確認、監査ログ、退職した人を確かめる）

触ってよいファイル・フォルダ：`supabase/migrations/`（新しいファイルを足すだけ）、`supabase/config.toml`（project_id だけ）、`fixtures/roleplay/`、`src/`（`src/foundation/` は名簿の一覧の画面の作り直しと、画面の枠への組み込みだけ）、`package.json`（scripts の追加だけ）、`tests/` の中で `tests/guard/` 以外、`docs/reports/report_roleplay-common_v1.md`
触ってはいけないもの：`tests/guard/`、`fixtures/foundation/`、`docs/`（報告書を除く）、`CLAUDE.md`、`NOTES.md`、`README.md`、ルートの `.gitignore`、`samples/`、流し込み済みのマイグレーションのファイル

## 5. 決めてよいこと／決めてはいけないこと

| 決めてよい | 決めてはいけない（止めて質問する） |
|---|---|
| 変数名・関数名（4章で名前を決めたものを除く）、ファイル内の書き方、共通の部品の作り方と置き場所 | 4章の表の名前・項目・権限の範囲、ライブラリの追加 |
| 画面の見た目（Rush up 資料デザインに従う）、架空データの中身（架空の名前だけ） | 左メニューに出す画面、画面の構成、この計画にない仕様 |

## 6. 完了条件（すべて満たしたら完了）
- [ ] 4章の表・関数・権限・トリガーが、すべて `supabase/migrations/` の新しいファイルにあり、`npm run db:push -- --dry-run` のあと `npm run db:push` で流し込み済み
- [ ] `npm run fixtures:load` のあと `npm run fixtures:roleplay:load` で架空データが入り、`fixtures:roleplay:remove` で消せる（名前は架空だけ）
- [ ] 画面の枠と左メニューがあり、名簿の一覧がそれを使って作り直され、②③の入口が「準備中」で開ける（本人が確かめる手順を報告書に書く）
- [ ] `npm test` で、守りのテスト（土台とロープレ）とほかのテストがすべて通る
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
1. 作業結果を `docs/reports/report_roleplay-common_v1.md` に、下の書式で書く
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
