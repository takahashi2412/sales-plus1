# SALES +1 作業メモ（NOTES）

作業を再開するときは、このファイル → docs/sales-plus1_handoff_v1.md の順に読む。
作業の区切りで「やったこと／次にやること」を上に追記していく（新しい日付が上）。

## 現在の状況（いつも最新に書き換える）

- フェーズ：企画・設計が完了し、開発の準備中。Gitとリポジトリの準備は完了。コードはまだない
- 正本：企画・設計は docs/sales-plus1_handoff_v1.md、それ以降の決定は下の「決定事項」（食い違うときは決定事項を優先）
- モック：https://claude.ai/artifact/P4LCaBUUUe9KogUY8cBWZ4
- 未決事項：下の「未決事項の進み具合」で管理する
- 関連案件：training\antigravity（Antigravityの使い方ガイド。sales-plus1はGitありの例外）

## 未決事項の進み具合

| # | 項目 | 状態 | メモ |
|---|---|---|---|
| 1 | 現行Excelの提供（指標名・時間帯・列構成） | 待ち | ユーザーから提供予定 |
| 2 | 技術構成（DB・認証・ホスティング・AI連携） | 未着手 | 次に検討する |
| 3 | KPI入力の承認フローの要否 | 未着手 | |
| 4 | 日次アラートの初期条件と閾値 | 未着手 | |
| 5 | AI提案の自動化レベルと移行基準 | 未着手 | 推奨は段階方式 |
| 6 | ロープレ評価項目／部下メモ種別タグ | 未着手 | |
| 7 | sales-plus1.web.app の取得確認 | 未着手 | 技術構成が決まってから |
| 8 | 未作成画面のモック（入力・ダッシュボード） | 未着手 | |
| 9 | 開発体制（頭脳＝Claude Code、手＝Antigravity） | 決定 | 2026-10-06 |
| 10 | git方針 | 決定 | 下の「決定事項」参照 |
| 11 | ルールの共有方法（AGENTS.md・GEMINI.md） | 検討中 | 図解：C:\Workspace\visuals\sales-plus1_rule-layers_v2.html |

## 決定事項（引き継ぎ資料にないもの）

### 開発体制（2026-10-06）
- Claude Code：設計、未決事項の決定、計画ファイル（docs\tasks\）、レビュー
- Antigravity：実装、動作確認、テスト

### git方針（2026-10-06）
- Git＋GitHub（非公開リポジトリ）を使う。置き場所は既存アプリ（rushup-weekly-report）と同じ takahashi2412（会社用として使用、権限は本人のみ）
- リポジトリ：https://github.com/takahashi2412/sales-plus1.git ／ 本線は main
- コミットの記録名：takahashi2412 ／ k.takahashi@rush-up.co.jp（各PCで git config --global に設定）
- Workspaceの「Gitは使わない」の例外として、このアプリだけGitを使う（C:\Workspace\CLAUDE.md に一覧あり）
- 流れ：① Claude Codeが計画ファイルを書く → ② Antigravityが作業用ブランチで実装・コミット → ③ Claude Codeが差分をレビュー → ④ 本人がOK → ⑤ Claude Codeが本線に取り込み、確認を取ってからpush
- 2台の受け渡しは、このアプリについては push／pull で行う
- メイン機：Git for Windows 2.55.0.5 をインストール済み（2026-10-06、winget）。2台目は未インストール

### Antigravityの作業のしかた（2026-10-06）
- Local＋作業用ブランチ。Claude Codeとは順番に使う（ガイドの「順番に使う」原則はそのまま）
- New Worktree は、実際に試して確かめてから検討する
- ガイドv2の「Gitなし → Local、Commit／Push は使えない」は、sales-plus1には当てはまらない（Commitまでは可）

### 計画ファイル（2026-10-06）
- ガイドの方式（plan_内容_v1.md を /plan @ で渡す）を使い、置き場所を docs\tasks\ にする
- 作業結果は Walkthrough に加えて docs\reports\ にファイルで残させる

### AGENTS.md（2026-10-06）
- ガイドの案件で一度見送ったのは、急ぐ必要がなかったため。sales-plus1で検討を続ける（未決事項11）
- 作るまでは、守らせたいルールを計画ファイルに書いて伝える

### KPIの入り方（2026-10-06）
- KPIはアプリで手入力しない。出どころは電話システム（CTIなど）のCSV
- 今：CSVを手で取り込む → いずれ：電話システムから自動で取り込む
- 引き継ぎ資料との違い：7章の「時間帯ごとにアプリで入力する画面」、10章の「第2段階でKPI入力をアプリに切り替え」はなくなる
- 9-3章の「当日の途中で検知するアラート」は、取り込みの回数しだい（1日1回なら翌朝の検知になる）。自動化の方法が決まってから見直す
- 一般日報は業後にその日のKPIを見て書く → 日報を書く前にKPIの取り込みが終わっている必要がある
- 自動化の方法：電話システムにAPIはない → ブラウザの自動操作で管理画面からCSVをダウンロードして取り込む
  - ログインはIDとパスワードだけ（2段階認証・画像認証なし）→ 自動化しやすい
  - 技術構成の条件：画面のない環境でブラウザを動かせる場所が必要（社内PCで定時実行／クラウドなど）
  - 取り込みを1日に何回も動かせば、当日の途中で検知するアラートを残せる
  - ログイン情報は .env などで保管し、コードに書かない。自動操作専用で閲覧だけできるアカウントが望ましい
  - 画面が変わると止まる → 失敗を通知する仕組みが必須。止まっている間は手でCSVを取り込む
  - 未確認：電話システムの利用規約で自動操作が禁止されていないか、製品名

### 業務の補足（2026-10-06、本人から）
| 業務 | 内容 | 引き継ぎ資料との関係 |
|---|---|---|
| KPI | CSVの取り込みでアプリに反映 | 上の「KPIの入り方」 |
| 一般日報 | 業後に、個人がKPIを確認してから書く | 日報の画面にその日のKPIを表示する |
| 責任者日報 | 業後に、当日の組織の結果 | 一致。組織の数字はKPIから自動集計できる |
| 部下メモ | 部下にどんな指示・指摘をしたか | 一致（種別タグで指示・指摘を分ける） |
| ロープレメモ | 誰に・どんな内容を・何分したか | 「何分」が新しい。資料の「評価項目ごとの点数」とどうつなぐかは見本を見て決める |
| 週間教育 | 個人分析 → 問題 → 原因 → 行動 → 振り返りを週ごとに回す | 「問題」「原因」が新しい。AI週次レポートとつなげられる。「狙うKPI」欄は残す |

### ルール共有で気をつけること（検討中の改良案から）
- 読み込みの失敗は警告が出ない → 作業開始時に両ツールに「読み込んでいるルール」を聞く
- 個人ルールは、@読み込みの動作を確かめるまで ~\.claude\CLAUDE.md から消さない
- 守りのテスト（本人版に部下メモを渡さない等）は頭脳側が持ち、Antigravityは変更しない
- Antigravityの報告は docs\reports\ にファイルで残させる
- ファイルごとに担当ツールを決める（同時編集を防ぐ）→ CLAUDE.md の「開発体制」に記載
- 2台目に渡すものに、ホームフォルダのルールファイルとAntigravityの設定も含める

## 決定を変えたときに直すファイル（影響表）

| 変える決定 | 直すファイル |
|---|---|
| git方針・作業の流れ | apps\sales-plus1\CLAUDE.md（開発体制・Git）、NOTES.md（決定事項）、docs\tasks\plan_template.md（0章・7章Git・8章）、Antigravityガイド（training\antigravity）、図解 sales-plus1_rule-layers（2章） |
| Gitで管理するアプリの追加・削除 | C:\Workspace\CLAUDE.md（一覧） |
| 守ること（機密・本人版など） | apps\sales-plus1\CLAUDE.md、docs\tasks\plan_template.md（7章）、.gitignore、（将来）AGENTS.md |
| ルールの共有方法 | 各CLAUDE.md、（将来）AGENTS.md・GEMINI.md、図解 sales-plus1_rule-layers |
| 個人ルール | ~\.claude\CLAUDE.md（2台とも）、（将来）~\.gemini\GEMINI.md |
| 2台目の手順 | NOTES.md「2台目の準備」 |

## 2台目の準備

1. Gitをインストールする（winget install --id Git.Git --exact --source winget）
2. 名前などを設定する（user.name＝takahashi2412、user.email＝k.takahashi@rush-up.co.jp、init.defaultBranch＝main）
3. 2台目に apps\sales-plus1 がすでにあるか確かめる。あれば上書きせず、名前を変えて残す（削除しない）
4. 本人のターミナルで C:\Workspace\apps に移動し、git clone https://github.com/takahashi2412/sales-plus1.git（初回はサインイン画面が出る）
5. ~\.claude\CLAUDE.md と C:\Workspace\CLAUDE.md を、更新日時を確かめてからメイン機からコピーする
6. 以降は作業前に必ず git pull

---

## 2026-10-06（火）メイン機

### やったこと
- Claude.ai での企画・設計の内容を docs/sales-plus1_handoff_v1.md として引き継いだ
- プロジェクトの CLAUDE.md を作成した
- この NOTES.md を作成した
- 開発体制（Claude Code／Antigravity）とgit方針を決めた
- ルールの共有方法を検討し、起こりうるミス・漏れを洗い出した（図解 v1 を作成）
- メイン機にGitをインストールし、GitHubリポジトリを作成して最初のpushまで完了（702577d）
- Git導入後の点検：CLAUDE.md にGitのルールがない、Workspaceの CLAUDE.md が「未導入」のまま、2台目の手順がない、録音ファイルが .gitignore で止まらない、などの漏れを見つけて修正した
- 点検で、training\antigravity の過去の決定（Gitなし・順番に使う・計画ファイルを@で渡す・AGENTS.md見送り）との食い違いを見つけ、上の「決定事項」のとおり整理した
- 図解を v2 に作り直した（v1の確かめ方「バージョン1.20.3以上」は旧IDEの番号で誤り → 2.0アプリに実際に聞いて確かめる、に修正。Git導入後の作業の流れを追加）。v1は残した
- 計画ファイルのひな形 docs\tasks\plan_template.md を作った（最初と最後のGit手順、決めてよいこと／いけないこと、守ること、報告書の書式）
- 技術構成の前に、作るものを詰めることにした。本人から6業務の補足とKPIの入り方（CTIのCSV → ブラウザ自動操作で自動取り込み）を聞き、決定事項に記録
- 見本データは samples\ に実名のまま入れてよい（本人の判断）。まとめる資料には実名を書かない
- 企画ダッシュボード C:\Workspace\visuals\sales-plus1_project-dashboard_v1.html を作った（全体の流れ・6業務・AIサイクル・段階導入・開発体制・未決事項・決定事項・次にやること）
- 気づき：Claudeアプリのターミナルパネルは、ユーザー名の「髙」を含むパスで部品を読み込めず動かなかった。日本語パスでの読み込み失敗は実際に起きる → AGENTS.md・GEMINI.md の読み込みも必ず実機で確認する
- 気づき：Claude Code の実行環境からはGitHubのサインイン画面を出せない。初回サインインは本人のターミナルで行う（2台目も同じ）

### 次にやること
1. 見本データ（各業務のExcel、電話システムのCSV）を samples\ に入れてもらい、業務ごとの項目と入力の実態を表にまとめる（未決事項1）
2. アプリ画面の試作（ダッシュボード／チーム一覧）を架空データで作る（未決事項8）
3. 聞き取り：利用者数、ログイン方法、端末、閲覧の権限、既存アプリとの関係、保守と予算
4. 要件をまとめて技術構成を決める（未決事項2）
5. 2台目の準備（上の「2台目の準備」）、Antigravityガイド v3、ルールの共有方法（AGENTS.md）
- 未確認：電話システムの利用規約（自動操作の可否）と製品名

### もう1台に渡すもの
- apps\sales-plus1 の中身：GitHubから取得する（手でコピーしない）
- C:\Users\髙橋圭ktakahashi\.claude\CLAUDE.md（個人ルール。2台目では「このPCの役割」だけ書き換える）
- C:\Workspace\CLAUDE.md（Gitで管理するアプリの一覧を追加）
- C:\Workspace\training\antigravity\NOTES.md（次にやることを1行追加）
- C:\Workspace\visuals\sales-plus1_rule-layers_v1.html
- C:\Workspace\visuals\sales-plus1_rule-layers_v2.html
- C:\Workspace\visuals\sales-plus1_project-dashboard_v1.html
- samples\ の見本データは渡さない（Gitに入らず、実名を含むため。必要なら本人が判断）
