import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  ClipboardCopy,
  Cloud,
  DatabaseBackup,
  ExternalLink,
  FileAudio,
  FileText,
  FolderOpen,
  HardDrive,
  KeyRound,
  Laptop,
  LayoutDashboard,
  Link,
  ListChecks,
  ListTodo,
  LockKeyhole,
  MessageSquareText,
  Music2,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  Users
} from "lucide-react";
import { SectionTitle } from "./ui.jsx";
import {
  buildCodexAuditPrompt,
  buildCodexConnectionPrompt,
  buildCodexFolderPrompt,
  getConnectionDocumentUrlState,
  normalizeManualProjectName
} from "../lib/manual-setup.js";
import "../manual.css";

const OWNER_STEPS = [
  ["1", "保存先と接続", "Driveの保存先を作り、使う機能だけAPIやApps Scriptを設定します。"],
  ["2", "作品と台本", "作品名を決め、章ごとに本文を登録します。"],
  ["3", "人物と共有", "人物、配役、収録フォルダーを整え、担当声優へ専用URLを渡します。"],
  ["4", "収録確認", "提出された録音を聴き、OK・リテイク・保留を更新します。"]
];

const ACTOR_STEPS = [
  ["1", "専用URLを開く", "ログインは不要です。制作担当者から届いた自分専用URLでホームを開きます。"],
  ["2", "担当セリフを表示", "台本で章を選び、自分のキャラクターボタンから担当セリフを表示します。"],
  ["3", "Driveへ録音を置く", "共有リンクから担当の収録フォルダーを開き、録音ファイルをアップロードします。"],
  ["4", "レ点で完了を伝える", "アップロード後、台本の「このセリフは収録済み」にチェックします。章内をすべて録り終えた時は、自分のキャラクターを選んで章のまとめチェックも使えます。"]
];

const ACTOR_PRIORITY_AREAS = [
  {
    target: "script",
    label: "台本",
    title: "担当セリフを確認する",
    detail: "章と自分の人物ボタンを選び、通常・ナレーション・心の声・イヤモニをまとめて確認します。",
    icon: FileText
  },
  {
    target: "links",
    label: "共有リンク",
    title: "収録フォルダーを開く",
    detail: "担当キャラクターのGoogle Driveフォルダーを開き、録音ファイルをアップロードします。",
    icon: FolderOpen
  },
  {
    target: "questions",
    label: "質問",
    title: "分からない点を送る",
    detail: "台本を書き換えず、対象のセリフを選んで制作オーナーへ質問します。",
    icon: MessageSquareText
  }
];

const ACTOR_RECORDING_ROUTE = [
  "ホームで締切、お知らせ、リテイクの有無を確認する",
  "台本で収録する章と自分のキャラクターボタンを選ぶ",
  "セリフ、演技指示、通常・心の声などの読み分けを確認する",
  "共有リンクから担当のGoogle Drive収録フォルダーを開く",
  "録音ファイルをアップロードしてから、台本の収録済みにチェックする",
  "後日、OK・リテイク・確認メモを見て、必要な場合だけ録り直す"
];

const DRIVE_FOLDER_ROWS = [
  ["必須", "作品の親フォルダー", "作品に関する保存先を一つにまとめる親フォルダー", "初期準備時", "URL登録は不要"],
  ["必須", "02_収録音源", "声優さんから受け取る録音をまとめる", "収録開始前", "共有リンク"],
  ["必須", "02_収録音源／キャラクター名", "担当声優が役ごとの録音をアップロードする", "配役決定時", "キャラクター／共有リンク"],
  ["推奨", "01_台本・共有資料", "台本Googleドキュメント、制作資料、接続情報をまとめる", "初期準備時", "必要な資料だけ共有リンク"],
  ["SE使用時", "03_SE／章名", "章ごとに生成・収集したSEを保存する", "SE制作前", "素材／必要素材／SE保存フォルダー"],
  ["募集時", "04_オーディション／フォーム", "自動生成したGoogleフォームをまとめる", "募集開始前", "タスク／フォーム自動作成"],
  ["募集時", "04_オーディション／生成画像", "フォームヘッダーとSNS用画像を保存する", "募集開始前", "タスク／フォーム自動作成"],
  ["任意", "05_確定素材", "主題歌・BGM・SE・完成音源・サムネイルを整理する", "素材確定時", "素材／確定素材"],
  ["推奨", "99_バックアップ", "書き出した制作データや更新前の控えを残す", "大きな更新前", "設定／制作データを書き出す"]
];

const LOCAL_FOLDER_ROWS = [
  ["Codexで保守する人のみ", "Voice Casting Studio作業フォルダー", "ソースコード、更新用ZIP、作業メモを置く任意の親フォルダー"],
  ["推奨", "backups", "WordPress更新前のテーマZIPや制作データJSONを残す"],
  ["任意", "exports", "Driveへ移す前の画像・音声など、一時的な書き出しを置く"],
  ["自動作成", "%LOCALAPPDATA%\\VoiceCastStudio\\audition-finisher-profile", "PCフォーム仕上げ用Chromeのログイン状態とSNS画像を保持する。手動作成・移動・削除は不要"]
];

const FOLDER_TREE = `[作品名]_Voice Cast Studio/
├─ 01_台本・共有資料/
│  ├─ 台本 Googleドキュメント
│  └─ Voice Cast Studio 接続情報（オーナー限定）
├─ 02_収録音源/
│  ├─ [キャラクター名]/
│  └─ [キャラクター名]/
├─ 03_SE/
│  ├─ 第1章/
│  └─ 第2章/
├─ 04_オーディション/
│  ├─ フォーム/
│  ├─ 生成画像/
│  └─ 声優オーディション総合管理スプレッドシート
├─ 05_確定素材/
│  ├─ 主題歌・BGM/
│  ├─ SE/
│  ├─ 完成音源/
│  └─ サムネイル/
└─ 99_バックアップ/`;

const CONNECTION_DOC_TEMPLATE = `Voice Cast Studio 接続情報（オーナー限定）

最終更新日：
管理者名：

【WordPress】
公開URL：
管理画面URL：
ユーザー名：
Codex用アプリケーションパスワード：（作業時だけ記入。完了後は削除・失効）

【Google】
使用するGoogleアカウントのメールアドレス：（パスワードは書かない）
作品の親フォルダーURL：
収録音源フォルダーURL：
SE親フォルダーURL：
オーディションフォームフォルダーURL：
オーディション生成画像フォルダーURL：
見本フォームURL：
管理スプレッドシートURL：

【Google Apps Script】
ウェブアプリURL（/exec）：
共有シークレット：（初期設定時だけ記入。設定後は削除または別の安全な場所へ移動）

【OpenAI】
プロジェクト名：
APIキー：（初期設定時だけ記入。設定後は削除）
設定状態：設定済み／未設定
キー末尾4文字：
再発行ページ：https://platform.openai.com/api-keys

【ElevenLabs】
APIキー名：
APIキーの値：（初期設定時だけ記入。設定後は削除）
設定状態：設定済み／未設定
キー末尾4文字：
権限：Sound Effects生成、User読み取り
クレジット上限：
再発行ページ：https://elevenlabs.io/app/settings/api-keys

【ブラウザログイン】
Googleフォーム所有アカウント：
Xアカウント名：（パスワードは書かない）`;

const API_GUIDES = [
  {
    id: "openai",
    name: "OpenAI APIキー",
    need: "オーディションフォームのヘッダー画像・SNS画像を自動生成するときだけ必要",
    location: "タスク → 募集役 → フォーム自動作成",
    link: "https://platform.openai.com/api-keys",
    linkLabel: "OpenAI API Keysを開く",
    steps: [
      "OpenAI Platformへログインし、使用するProjectを選びます。",
      "API Keysで「Create new secret key」を押し、Voice Cast Studio用と分かる名前で作成します。",
      "表示されたキーを一度だけコピーし、ツールのOpenAI APIキー欄へ保存します。",
      "使用量と請求設定を確認し、使わないキーや漏えいしたキーは削除・再発行します。"
    ],
    note: "ChatGPTへログインするパスワードではありません。APIキーはブラウザのコードや公開資料へ貼らず、このツールのオーナー専用設定へ保存します。"
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs APIキー",
    need: "必要素材からSEをツール内で直接生成するときだけ必要",
    location: "素材 → 必要素材 → ElevenLabs Sound Effects連携",
    link: "https://elevenlabs.io/app/settings/api-keys",
    linkLabel: "ElevenLabs API Keysを開く",
    steps: [
      "ElevenLabsへログインし、API Keysから新しいキーを作成します。",
      "キーの制限を有効にし、Sound Effectsの生成とUserの読み取りだけを許可します。画面の表記が異なる場合は、SE生成と利用枠確認に必要な最小権限を選びます。",
      "クレジット上限と有効期限を設定し、表示されたキーをツールへ保存します。",
      "保存後に接続確認を行い、残りクレジットが表示されることを確認します。"
    ],
    note: "キーは制作オーナーごとに暗号化保存されます。声優さんには設定欄も生成ボタンも表示されません。"
  },
  {
    id: "apps-script",
    name: "Google Apps Scriptウェブアプリ",
    need: "Googleフォームの複製、Driveへの画像保存、締切同期、応募者取り込みを自動化するときに必要",
    location: "タスク → フォーム自動作成の接続設定",
    link: "https://script.google.com/home",
    linkLabel: "Google Apps Scriptを開く",
    steps: [
      "Google Apps Scriptで新しいプロジェクトを作り、このツールの docs/google-apps-script/AuditionForms.gs を貼り付けます。",
      "見本フォームID、フォーム保存先フォルダーID、生成画像保存先フォルダーID、十分に長い共有シークレットを設定します。",
      "必要な関数を一度実行し、GoogleフォームとDriveへのアクセスを承認します。",
      "「デプロイ → 新しいデプロイ → ウェブアプリ」を選び、実行ユーザーを自分にします。WordPressからGoogleログインなしで呼び出す構成では、アクセスできるユーザーを全員にし、共有シークレットで保護します。",
      "発行された /exec のURLと同じ共有シークレットをWordPress側へ設定します。コード変更後は新しいバージョンへ更新します。"
    ],
    note: "Google Drive APIキーは別途いりません。Apps Scriptが、承認したGoogleアカウントの権限でDriveとフォームを操作します。共有シークレットはURLとは別に管理してください。"
  },
  {
    id: "wordpress",
    name: "WordPressアプリケーションパスワード",
    need: "Codexからテーマを更新したり、WordPress REST APIへ安全に接続するときだけ必要",
    location: "WordPress管理画面 → ユーザー → プロフィール → アプリケーションパスワード",
    link: "https://developer.wordpress.org/advanced-administration/security/application-passwords/",
    linkLabel: "WordPress公式手順を開く",
    steps: [
      "WordPressへHTTPSでログインし、自分のプロフィールを開きます。",
      "アプリケーションパスワードに「Voice Cast Studio Codex」など用途が分かる名前を付けて追加します。",
      "一度だけ表示される値をCodexの接続設定へ使います。通常のWordPressログイン画面へ入力するものではありません。",
      "作業が終わったら失効するか、定期的に新しいものへ交換します。"
    ],
    note: "WordPressのメインパスワードをCodexへ渡す必要はありません。用途ごとに作れて個別に失効できるアプリケーションパスワードを使います。"
  }
];

const OWNER_SECTIONS = [
  {
    id: "owner-setup-folders",
    title: "準備するフォルダーと保存先",
    summary: "録音・SE・フォーム・素材を迷わず保存できるように、最初にDriveとPCの置き場所を整えます。",
    icon: HardDrive,
    kind: "folders"
  },
  {
    id: "owner-setup-access",
    title: "API・ログイン情報を準備する",
    summary: "使う機能に必要な接続だけを設定し、秘密情報はオーナー限定で安全に管理します。",
    icon: KeyRound,
    kind: "access"
  },
  {
    id: "owner-home",
    title: "ホームで状況をつかむ",
    summary: "作品全体の進捗、確認待ち、質問、締切を最初に確認します。",
    icon: LayoutDashboard,
    target: "home",
    steps: [
      "画面上部の作品選択で、管理する収録プロジェクトを選びます。",
      "収録締切と公開予定は日付・時刻まで設定し、追加の締切は「期日を追加」、制作予定は予定画面の「予定を追加」から増やします。",
      "全セリフ、収録済み、確認OK、リテイクの件数を確認します。",
      "未確認録音、未回答の質問、直近の予定から優先する作業を開きます。"
    ]
  },
  {
    id: "owner-concept",
    title: "コンセプト・ビジョンを全員へ共有する",
    summary: "Umbrella Paradeの活動方針や大切にしている考えを、全メンバーへ伝えます。",
    icon: Sparkles,
    target: "concept",
    steps: [
      "「コンセプト・ビジョン」を開き、団体名、一言で表すコンセプトを入力します。",
      "タブを切り替え、コンセプト、ビジョン、大切にしていることを入力します。",
      "入力中はWordPressへ送信されません。内容を確認してから「保存」を押します。",
      "保存した内容は作品を問わず共通で、制作管理者と声優さんにも同じ内容が表示されます。"
    ]
  },
  {
    id: "owner-script",
    title: "台本を登録・更新する",
    summary: "章ごとの本文登録と、セリフ単位で進捗を持つ台本を使い分けます。",
    icon: FileText,
    target: "recording",
    steps: [
      "「台本編集」で作品名を確認し、「章ごとの本文」に章名とGoogleドキュメントの本文を貼り付けます。",
      "Googleドキュメントの見出し2はシーン目次になります。貼り付け後でも、行を選んで「見出し2」に変更できます。",
      "キャラクター別表示やセリフごとの録音管理が必要な箇所は、話者を持つセリフとして登録します。",
      "既存台本の修正は「差分更新」を使うと、一致するセリフの録音・確認状況を残せます。",
      "「完全入れ替え」は進捗を引き継ぎません。実行前の台本は保存版へ自動保存されます。"
    ],
    note: "ルビは原稿内で「｜覚悟《かくご》」と入力するか、セリフのルビ編集から設定します。"
  },
  {
    id: "owner-board",
    title: "録音を確認する",
    summary: "章・シーン・人物で絞り込み、提出録音と台本を同じ場所で確認します。",
    icon: FileAudio,
    target: "recording",
    steps: [
      "「進行ボード」で全文、章、シーンの順に表示範囲を選びます。",
      "登場人物は複数選択できます。「前後のセリフも表示」で掛け合いの流れも確認できます。",
      "ヴェルを選ぶと、通常・心の声・イヤモニを含むヴェルの全セリフが表示されます。読み分けはセリフ名の横のラベルで確認します。",
      "声優さんが収録したセリフは「収録済み」にチェックし、確認状況を「OK」「リテイク」「保留」から選びます。",
      "章と登場人物を選ぶと、その人物の「章内すべて収録済み」と「章内すべて確認OK」が表示されます。シーンを表示中でも選択した人物の章内全セリフへ反映でき、ほかの人物と「リテイク」のセリフは変更しません。",
      "画面に追従する「アクセント辞典」へ単語を入力すると、東京大学 OJADの検索結果をツール内で確認できます。OJADで見つからない場合は「Googleで検索」を押すと、検索語と「アクセント・発音・標準語」を入力済みの検索画面が開きます。",
      "リテイクを選んだら「リテイク指示」を開き、台本文から直す箇所を選択します。指示の種類・直し方を入力し、必要なら辞典にない語も読みとアクセントが下がる位置を手動で指定できます。台本文そのものは変更されません。",
      "保存した箇所はセリフ内にピンクで表示されます。声優さんが録り直して「再収録済み」にレ点を付けると、状態が「再提出済み」になります。"
    ]
  },
  {
    id: "owner-characters",
    title: "キャラクターと配役を整える",
    summary: "人物情報と担当声優、収録先を一か所で管理します。",
    icon: Users,
    target: "characters",
    steps: [
      "左側の役目次はスクロール中も追従します。役名を押すと、そのキャラクターの登録欄へ直接移動できます。",
      "キャラクター名、担当声優、担当者SNS、表示色、設定・人物像を登録します。SNSは入力欄右側のリンクボタンから開けます。",
      "画像はアップロード後に位置と拡大率を調整し、顔が見やすい位置で保存します。",
      "キャラクターごとのGoogle Drive収録フォルダーURLを登録します。",
      "担当声優一覧の「URLをコピー」でログイン不要の専用URLを作り、該当する声優さん本人へ渡します。",
      "並び順はドラッグ操作または上下ボタンで変更できます。",
      "台本からセリフがなくなった人物は自動で「台本外」へ移ります。設定と画像は残り、台本へ再登場すると自動で通常一覧へ戻ります。"
    ]
  },
  {
    id: "owner-links",
    title: "収録フォルダーと共有URLを登録する",
    summary: "キャラクター別の録音先と、作品全体で使うリンクを分けて管理します。",
    icon: Link,
    target: "links",
    steps: [
      "作品全体で共有する資料、連絡先、LINEオープンチャットなどは「共有URL」へ追加します。",
      "共有URLはリンクごとに表示色を選び、ドラッグまたは上下ボタンで並べ替えます。",
      "画面下の「収録フォルダー一覧」で、キャラクターとGoogle Driveフォルダーの対応を確認します。",
      "制作オーナーはフォルダー行をドラッグするか上下ボタンを使って、一覧だけの表示順を変更できます。",
      "声優さんには担当キャラクターの収録フォルダーだけが表示され、並べ替え操作は表示されません。"
    ],
    note: "録音ファイル本体はWordPressへ保存されません。WordPressにはGoogle Driveの共有URLだけを保存します。"
  },
  {
    id: "owner-materials",
    title: "確定素材と必要素材を管理する",
    summary: "完成した素材と、台本から拾った未手配のSEを分けて整理します。",
    icon: Music2,
    target: "materials",
    steps: [
      "「確定素材」では、音声素材のGoogle Drive共有URLやサムネイル画像を登録し、つまみをドラッグして表示順を変更します。",
      "「必要素材」には、台本で行頭が「SE：」「SE:」「SFX：」「効果音：」になっている指示が自動で集まります。章ボタンで絞り込み、使用するシーンまで確認できます。同じSEが複数章にある場合は各章に表示され、候補音や確定状態は一つの素材として共有されます。",
      "「SE保存フォルダー」には、全体の親フォルダーと章ごとのGoogle Driveフォルダーを登録します。生成した音を保存する章の開くボタンから、そのまま保存先へ移動できます。",
      "誤って拾われた項目は「必要素材から外す」、台本に書かれていない素材は「必要素材」ボタンから手動追加します。手動追加した素材は対象章を選べ、外した自動抽出は画面下から復元できます。",
      "SE配布サイトには、サイト名とURLを登録します。つまみのドラッグまたは上下矢印で並べ替え、開くボタンから各サイトへ移動できます。",
      "ElevenLabsを使う場合は「ElevenLabs Sound Effects連携」を開き、自分のAPIキーを登録します。キーはログイン中の制作オーナーごとに暗号化保存され、声優さんの画面には設定欄も生成ボタンも表示されません。",
      "各SEの「SE制作プロンプト」でElevenLabs用を選ぶと、長さや指示への忠実度を調整して直接生成できます。毎回の確認後に自分のElevenLabs利用枠を消費し、生成結果をその場で試聴してMP3保存します。",
      "Adobe Fireflyを使う場合は「Adobe Firefly用」を選びます。API料金は発生せず、Codexが作成した英語プロンプトを欄へ保存し、「Firefly用をコピー」からAdobe Fireflyへ貼り付けます。",
      "ElevenLabsで生成した音声はWordPressには保存されません。ページを閉じる前に、採用候補をMP3で保存してください。",
      "候補が見つかったら、配布ページ、試聴用音声、ダウンロードの各URLを登録します。試聴して採用する素材は「確定素材へ登録」で従来の素材一覧へ移せます。",
      "素材を選ぶと右下に共通プレイヤーが表示されます。同じツール内で台本やキャラクターへ移動してもプレイヤーは残り、再生を続けられます。",
      "元ファイルを開く操作、素材の編集・削除は制作オーナーだけに表示されます。"
    ]
  },
  {
    id: "owner-questions",
    title: "質問へ回答する",
    summary: "作品全体または個別のセリフに紐づいた質問を管理します。",
    icon: MessageSquareText,
    target: "questions",
    steps: [
      "未回答の質問を開き、必要なら紐づいたセリフと前後の内容を確認します。",
      "回答を書いて「回答を確定」を押すと、その質問は「回答済み」へ移ります。",
      "質問者が回答を確認して「解決しました」を押すと「解決済み」へ移ります。「さらに質問」から送ると、前の質問につながった未回答の追加質問になります。",
      "台本変更が必要な質問は、先に保存版を残してから台本を更新します。"
    ]
  },
  {
    id: "owner-tasks",
    title: "募集役・応募者・連絡文を管理する",
    summary: "オーディション準備、フォーム応募者、個別連絡、全体向けSNS文を一つの画面で管理します。",
    icon: ListTodo,
    target: "tasks",
    steps: [
      "台本にセリフがあり、担当声優名が空欄のキャラクターは「配役が決まっていない役」へ自動表示されます。",
      "募集役タブの左側にある追従目次から役名を押すと、その役のフォーム作成状況とSNS募集文へ直接移動できます。",
      "キャラクター画面で担当声優名を登録すると自動で一覧から外れ、名前を外すと再び一覧へ戻ります。台本外として保存されているキャラクターは対象になりません。",
      "作成したオーディションフォームをまとめたGoogle DriveフォルダーのURLを登録すると、未配役の各役から同じフォルダーを開けます。",
      "「声優オーディション総合管理スプレッドシート」に管理表のURLを登録すると、タスク画面から直接開けます。管理表を変更した場合は、新しいURLへ書き換えると保存されます。",
      "初回だけ「フォーム自動作成」でOpenAI APIキーを保存します。生成画像はGoogle Driveの専用フォルダーへ自動保存されるため、PC保存先の選択は不要です。APIキーは暗号化され、入力後に再表示されません。",
      "フォーム自動作成内の「募集文テンプレート設定」では、全役共通の固定文を項目別に編集し、完成形をプレビューして保存できます。役名・性別・セリフ・締切・フォームURLなどは自動差し込みのため編集対象外です。保存内容は次に各役の「募集文を作成」を押した時から反映され、すでに手直しした募集文は勝手に上書きされません。",
      "SNS募集文で応募締め切り日と時刻を設定してから「フォームを自動作成」を押すと、その日時をGoogleフォームの説明へ自動表示し、締め切り後は回答受付も自動で終了します。時刻は日付を選ぶと23:59が初期値になります。",
      "役のキャラクター画像を登録してから「フォームを自動作成」を押すと、最初に見本フォームを複製して設問構成・公開状態・応募締め切りを検査し、その後ヘッダーとSNS画像を1枚ずつ生成・監査してDriveへ保存します。途中で画像生成に時間がかかっても、先に作ったフォームは残ります。",
      "自動検査で不要な選択肢や重複した音声アップロード欄を見つけた場合は自動修正します。作成済みフォームで締め切りを変更した場合は「構成・締切を再同期」を押します。この操作だけなら画像を作らず、OpenAI API料金もかかりません。",
      "フォームと画像2枚の作成後は、PC仕上げがアップロード先の復元、Drive保存済みヘッダーの設定、応募画面の音声アップロード欄の確認まで行います。PC仕上げ用ChromeでGoogleアカウントの選択を求められた場合は、フォーム所有者のアカウントを選んでからもう一度実行します。",
      "SNS募集文を作成した後に「画像付きでXを開く」を押すと、PC仕上げ用Chromeで募集文を入力し、生成済みSNS画像も添付したX投稿画面を開きます。文章と画像を確認してから投稿してください。ツールが勝手に投稿することはありません。",
      "初回やXのログインが切れている場合は、SNS募集文の「Xのログインを確認」を押し、開いたPC仕上げ用Chromeでログインします。ログイン後、この画面に戻って「画像付きでXを開く」をもう一度押してください。",
      "SNS募集文に違う画像が紐づいている場合は、画像フォルダーで正しいSNS画像を開いて共有URLをコピーし、「X投稿に使うSNS画像」へ貼り付けます。表示されたプレビューを確認してからXを準備します。",
      "SNS募集文の「セリフを確認」を押すと、同じ画面のまま、その役の台本セリフを章・シーン・読み分け付きで確認できます。チェックした複数のセリフはオーディション用セリフへ自動保存されます。",
      "役ごとに「構成自動検査済み」とフォーム・画像のリンク、監査結果を同じ横並び欄で確認できます。ヘッダー設定と音声アップロード欄の確認はPC仕上げが自動で行うため、個別のチェック操作は不要です。準備が整ったら「募集開始済み」をチェックします。担当声優が決まって一度一覧から外れても、再び未配役になった場合は状況が残ります。",
      "募集役タブの「Googleフォーム回答を取り込む」を押すと、作成済みフォームから応募者名・X・応募役・回答日時をまとめて取得します。応募者は役ごとの折りたたみ一覧へ入り、検索時は該当する役が自動で開きます。@IDや旧Twitter URLも https://x.com/ID 形式へ自動変換されます。音声ファイルは取り込みません。",
      "応募者の合格・別役で担当する役を選び、「合格・担当声優へ反映」を押すと、名前・連絡用の呼び名・呼称・Xがキャラクターへまとめて登録されます。",
      "配役以外の作業は「手動タスク」へ追加し、完了チェック、優先度、任意の期日、共有メモを更新します。",
      "タスク上部の「連絡テンプレート」を開くと、連絡テンプレ用スプレッドシートと同じ7種類の基本文を編集できます。基本文は役別の送信用文章とは別に保存されます。",
      "キャラクター画面で担当声優、連絡用の呼び名、呼称、担当者SNSを登録します。呼称は初期値が「さん」です。連絡用の呼び名を空欄にした場合は、担当声優名から末尾の「さん」「様」を外した名前を使います。",
      "連絡テンプレートでは、配役済みの声優さんだけでなくフォーム応募者も送る相手に選べます。「別の役を依頼」ではお願いする役を選ぶと、登場章とセリフ数を台本から自動判定します。セリフが4個以下の役だけ「こちらセリフ数は少ないのですが、」を表示します。",
      "「文章をコピーしてXを開く」を押すと、送信用文章をコピーして登録済みのXプロフィールを開きます。相手のメッセージ画面を開き、文章を貼り付けて内容を確認してから送信します。",
      "「SNSテンプレート」では、募集・結果発表・制作進捗・公開案内など、個人宛てではない全体向け投稿文を基本テンプレートと今回用の文章に分けて保存できます。「先行結果のお知らせ」では複数の役を選び、投稿文の役名へまとめて反映できます。"
    ]
  },
  {
    id: "owner-schedule",
    title: "予定とお知らせを共有する",
    summary: "収録締切、公開予定、編集状況、全体連絡を同じ場所で更新します。",
    icon: ListChecks,
    target: "schedule",
    steps: [
      "収録締切、公開予定日、編集状況はホームと予定のどちらからでも同じ内容を更新できます。",
      "リテイク期限や確認期限は「追加の期日」、収録・編集・打ち合わせなどは「直近の予定」へ分けて登録します。どちらも名前・種類・日付・任意の時刻・状態・共有メモを持てます。",
      "全員へ伝える内容は「メンバー全体へのお知らせ」に登録します。"
    ]
  },
  {
    id: "owner-settings",
    title: "バックアップを残す",
    summary: "大きな変更の前後に制作データを書き出します。",
    icon: Settings,
    target: "settings",
    steps: [
      "設定を開き、必要なタイミングで制作データをJSONへ書き出します。",
      "台本内の「原文と保存版」は、削除や入れ替え前の状態を復元するときに利用できます。",
      "JSONには録音ファイル本体を含めず、Google Drive URLだけを書き出します。"
    ]
  }
];

const ACTOR_SECTIONS = [
  {
    id: "actor-home",
    title: "ホームで担当状況を確認する",
    summary: "制作担当者から届いた自分専用URLを開き、締切と自分に関係する更新を最初に確認します。ログイン操作は不要です。",
    icon: LayoutDashboard,
    target: "home",
    steps: [
      "サイトのトップURLでは、ログインせずに全作品の共通内容を閲覧できます。",
      "担当作品を選び、収録済み、確認待ち、リテイク、質問の件数を確認します。",
      "専用URLは担当情報へアクセスする鍵なので、他の人へ転送せず、同じURLをブックマークして使います。",
      "お知らせと直近の予定を読み、締切や台本変更がないか確認します。",
      "情報が古いときは、画面上部の再読み込みボタンで最新状況を取得します。"
    ]
  },
  {
    id: "actor-concept",
    title: "Umbrella Paradeのコンセプト・ビジョンを読む",
    summary: "作品づくりで共有している考えや、活動の方向性を確認します。",
    icon: Sparkles,
    target: "concept",
    steps: [
      "ホーム右隣の「コンセプト・ビジョン」を開きます。",
      "団体のコンセプト、ビジョン、大切にしていることを確認します。",
      "内容は制作オーナーが更新し、声優アカウントでは書き換えられません。"
    ]
  },
  {
    id: "actor-script",
    title: "担当セリフを探す",
    summary: "全文から章、シーンへ順に絞り、必要な人物だけを表示します。",
    icon: BookOpen,
    target: "script",
    steps: [
      "「台本」で、ボイスドラマ脚本全文または収録する章を選びます。",
      "章を選ぶと、その章のシーンと登場人物が表示されます。人物は複数選択できます。",
      "人物ボタンは「ヴェル」のような台本用の短い名前です。セリフ欄には「ヴェル13世」のような正式名称が表示されます。",
      "人物を1人選ぶと、通常・ナレーション・心の声・イヤモニを含む、その人物の全セリフが表示されます。読み分けは名前の横のラベルで確認します。",
      "自分だけを選ぶと担当セリフ、複数人を選ぶと掛け合いをまとめて確認できます。",
      "人物を選ぶと「前後のセリフも表示」が使えます。レ点を入れると、対象セリフの直前・直後を一緒に確認できます。",
      "分からないアクセントは、画面に追従する「アクセント辞典」で検索します。まず東京大学 OJADで確認し、見つからない場合だけ「Googleで検索」を押します。検索結果でも判断できない語や作品固有語は、制作担当へ質問してください。"
    ]
  },
  {
    id: "actor-submit",
    title: "録音を提出する",
    summary: "録音ファイルはGoogle Driveへ置き、台本では収録済みだけをチェックします。",
    icon: FileAudio,
    target: "script",
    steps: [
      "「共有リンク」またはキャラクター画面から、自分の収録フォルダーを開きます。",
      "録音ファイルをGoogle Driveへアップロードします。",
      "アップロードが完了してから、担当セリフの「このセリフは収録済み」にチェックします。チェックすると自動保存されます。",
      "リテイク時はピンクで示された箇所、直し方、手動アクセントを確認します。録り直したファイルを同じ担当フォルダーへ置き、ファイル名の末尾に1回目は「re1」、2回目は「re2」のように回数に応じた番号を付けます。",
      "アップロード後に「再収録済み」へレ点を付けると、「再提出済み」として制作側へ共有されます。"
    ],
    note: "録音ファイルはWordPressへ直接アップロードしません。必ず指定されたGoogle Driveフォルダーを使ってください。"
  },
  {
    id: "actor-review",
    title: "確認結果とリテイクを見る",
    summary: "提出後の状態と管理者からのメモを台本上で確認します。",
    icon: CheckCircle2,
    target: "script",
    steps: [
      "各セリフの「制作確認」で状況を確認します。「未確認」は管理者の確認待ち、「OK」は確認完了です。",
      "「リテイク」になった場合は、セリフ内のピンクの箇所と「リテイク箇所」の指示を確認します。読みが表示されている場合は、黒い点と赤い下がり目も確認してください。",
      "録り直したファイルを担当フォルダーへ置き、「再収録済み」にレ点を付けます。",
      "判断に迷う内容は、台本を書き換えず「質問」から管理者へ確認します。"
    ]
  },
  {
    id: "actor-links",
    title: "収録フォルダーと共有資料を開く",
    summary: "自分の録音先と、作品全体の共有リンクを確認します。",
    icon: FolderOpen,
    target: "links",
    steps: [
      "収録フォルダーには、自分が担当するキャラクターのリンクが表示されます。",
      "共有URLには、作品全体の資料や連絡先が表示されます。",
      "リンクが開けない場合は、質問からリンク名と状況を管理者へ伝えます。"
    ]
  },
  {
    id: "actor-materials",
    title: "参考音源と完成素材を確認する",
    summary: "確定した音源や、制作側が検討している必要素材を確認します。",
    icon: Music2,
    target: "materials",
    steps: [
      "「確定素材」では、登録された音源やサムネイルを種類別に確認できます。",
      "「必要素材」では、章ボタンで台本から抽出されたSEを絞り込み、使用箇所や制作側が登録した候補音を確認できます。",
      "素材カードの「再生」を押すと、画面右下に共通プレイヤーが表示されます。Drive音源はプレイヤー内の再生ボタンを押して聴きます。",
      "同じツール内で台本やキャラクターへ移動してもプレイヤーは残ります。停止は右下の停止ボタンから行えます。別のChromeタブや別ウィンドウとは再生状態を共有しません。",
      "声優アカウントでは素材の編集、削除、元ファイルの操作はできません。"
    ]
  },
  {
    id: "actor-questions",
    title: "わからない点を質問する",
    summary: "作品全体または特定のセリフを選んで管理者へ質問できます。",
    icon: CircleHelp,
    target: "questions",
    steps: [
      "質問する対象のセリフを選び、内容を具体的に入力します。作品全体についての質問も登録できます。",
      "管理者から回答が届くと、同じ質問の中に回答が表示されます。",
      "回答で解決したら「解決しました」を押します。まだ不明点が残る場合は「さらに質問」を押し、前の質問につながる形で追加内容を送ります。"
    ]
  },
  {
    id: "actor-tasks",
    title: "未配役と制作タスクを確認する",
    summary: "募集中の役と、制作オーナーが共有した作業状況を確認します。",
    icon: ListTodo,
    target: "tasks",
    steps: [
      "「配役が決まっていない役」には、現在オーディションが必要なキャラクターだけが表示されます。",
      "オーディションフォームの保管フォルダーは制作オーナー専用のため、声優さんの画面には表示されません。",
      "各役の「フォーム作成済み」「募集開始済み」で、オーディション準備の進み具合を確認できます。",
      "手動タスクの内容と完了状況は全員で確認できます。追加・編集・削除は制作オーナーが行います。"
    ]
  },
  {
    id: "actor-schedule",
    title: "締切とお知らせを確認する",
    summary: "収録締切、公開予定、制作状況を全員で同じ画面から確認します。",
    icon: ListChecks,
    target: "schedule",
    steps: [
      "収録締切・追加の期日と、直近の制作予定を別々に確認します。",
      "予定やお知らせは制作オーナーが更新します。声優アカウントから追加・編集・削除はできません。"
    ]
  },
  {
    id: "actor-trouble",
    title: "表示や保存で困ったとき",
    summary: "人物ボタン、収録フォルダー、収録済みチェックで困った場合の確認順です。",
    icon: RefreshCw,
    steps: [
      "人物ボタンが見つからないときは、正しい作品と章を選んでいるか確認し、画面上部の「最新状況を読み込む」を押します。",
      "Google Driveへアップロードできないときは、共有リンクが開けるかを確認し、リンク名と表示された内容を「質問」から送ります。",
      "収録済みチェックが保存されないときは、通信が戻ってからページを再読み込みし、チェック状態をもう一度確認します。",
      "台本やキャラクター情報に間違いを見つけても直接変更せず、対象の章・シーン・セリフを書いて質問します。"
    ],
    note: "録音ファイルをWordPressへ送る必要はありません。録音本体はGoogle Drive、完了報告だけを台本のレ点で共有します。"
  }
];

const ACTOR_SECTION_ORDER = [
  "actor-script",
  "actor-submit",
  "actor-review",
  "actor-home",
  "actor-links",
  "actor-questions",
  "actor-tasks",
  "actor-schedule",
  "actor-materials",
  "actor-concept",
  "actor-trouble"
];

const PERMISSION_ROWS = [
  ["共有情報・担当台本を見る", "可", "可", "可"],
  ["コンセプト・ビジョンを編集する", "可", "不可", "不可"],
  ["録音を提出する", "可", "可", "担当分のみ"],
  ["録音のOK・リテイクを付ける", "可", "可", "不可"],
  ["台本の追加・編集・削除・入れ替え", "可", "不可", "不可"],
  ["キャラクター・素材・タスク・予定を編集する", "可", "不可", "不可"],
  ["APIキー設定・オーディションフォーム自動作成", "可", "不可", "不可"],
  ["質問する", "可", "可", "可"],
  ["質問へ管理者回答を付ける", "可", "可", "不可"],
  ["回答確認後に解決・追加質問を選ぶ", "不可", "不可", "自分の質問のみ"]
];

function QuickStart({ audience }) {
  const steps = audience === "owner" ? OWNER_STEPS : ACTOR_STEPS;
  return (
    <section className="manual-quick-start" aria-labelledby={`manual-${audience}-quick-title`}>
      <div className="manual-section-kicker"><ListChecks size={18} /><h3 id={`manual-${audience}-quick-title`}>最初の流れ</h3></div>
      <div className="manual-step-list">
        {steps.map(([number, title, detail]) => (
          <div className="manual-step" key={number}>
            <span>{number}</span>
            <div><b>{title}</b><p>{detail}</p></div>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActorPriorityGuide({ onNavigate }) {
  return (
    <section className="manual-actor-priority" aria-labelledby="manual-actor-priority-title">
      <header>
        <div>
          <span>声優さんはここから</span>
          <h3 id="manual-actor-priority-title">収録で使う3つの画面</h3>
          <p>基本操作は「台本」「共有リンク」「質問」の3か所です。台本や素材そのものを編集する必要はありません。</p>
        </div>
        <strong>最優先</strong>
      </header>
      <div className="manual-actor-area-list">
        {ACTOR_PRIORITY_AREAS.map(({ target, label, title, detail, icon: Icon }) => (
          <article key={target}>
            <Icon size={21} />
            <div><span>{label}</span><b>{title}</b><p>{detail}</p></div>
            {onNavigate && <button type="button" className="secondary" onClick={() => onNavigate(target)}>{label}を開く<ArrowRight size={15} /></button>}
          </article>
        ))}
      </div>
      <div className="manual-recording-route">
        <div className="manual-section-kicker"><CheckCircle2 size={18} /><h4>1回の収録手順</h4></div>
        <ol>{ACTOR_RECORDING_ROUTE.map((step) => <li key={step}>{step}</li>)}</ol>
      </div>
      <p className="manual-actor-lock-note"><LockKeyhole size={18} /><span><b>声優さんが変更するのは、担当セリフの「収録済み」、質問の登録、回答確認後の「解決済み」だけです。</b>台本本文、キャラクター、素材、予定、OK・リテイク判定は制作側が管理します。</span></p>
    </section>
  );
}

function PermissionTable({ viewerRole }) {
  return (
    <section className="manual-permissions" aria-labelledby="manual-permissions-title">
      <div className="manual-section-kicker"><ShieldCheck size={18} /><h3 id="manual-permissions-title">権限の早見表</h3></div>
      {viewerRole === "manager" && <p className="manual-access-note"><LockKeyhole size={17} />現在のアカウントは制作管理者です。台本本文、キャラクター、素材、予定の変更は制作オーナーへ依頼してください。</p>}
      <div className="manual-table-scroll">
        <table>
          <thead><tr><th>操作</th><th>制作オーナー</th><th>制作管理者</th><th>声優さん</th></tr></thead>
          <tbody>{PERMISSION_ROWS.map((row) => <tr key={row[0]}>{row.map((cell, index) => <td key={`${row[0]}-${index}`}>{index ? <span className={cell === "不可" ? "is-locked" : "is-allowed"}>{cell}</span> : cell}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}

function CopyablePrompt({ title, description, value, label = "指示文をコピー", children, disabled = false }) {
  const [copyState, setCopyState] = useState("idle");

  const handleCopy = async () => {
    if (disabled) return;
    try {
      let copied = false;
      if (navigator.clipboard?.writeText) {
        try {
          await Promise.race([
            navigator.clipboard.writeText(value),
            new Promise((_, reject) => window.setTimeout(() => reject(new Error("clipboard timeout")), 800))
          ]);
          copied = true;
        } catch {
          copied = false;
        }
      }
      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        copied = document.execCommand("copy");
        textarea.remove();
      }
      if (!copied) throw new Error("copy failed");
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2200);
    } catch {
      setCopyState("error");
    }
  };

  return (
    <section className="manual-copy-block">
      <header>
        <div><b>{title}</b>{description && <p>{description}</p>}</div>
        <button type="button" className="secondary" onClick={handleCopy} disabled={disabled}>
          {copyState === "copied" ? <Check size={16} /> : <ClipboardCopy size={16} />}
          {copyState === "copied" ? "コピーしました" : copyState === "error" ? "コピーできませんでした" : label}
        </button>
      </header>
      {children}
      <span className="manual-prompt-preview-label">自動作成された指示文（編集は不要です）</span>
      <pre>{value}</pre>
    </section>
  );
}

function FolderSetupGuide({ defaultProjectName = "" }) {
  const normalizedDefaultName = normalizeManualProjectName(defaultProjectName);
  const [projectName, setProjectName] = useState(() => normalizedDefaultName);
  const [documentMode, setDocumentMode] = useState("search");
  const [documentUrl, setDocumentUrl] = useState("");
  const publicUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const current = new URL(window.location.href);
    current.search = "";
    current.hash = "";
    return current.href.replace(/\/$/, "");
  }, []);

  useEffect(() => {
    if (!normalizedDefaultName) return;
    setProjectName((current) => current.trim() ? current : normalizedDefaultName);
  }, [normalizedDefaultName]);

  const cleanProjectName = normalizeManualProjectName(projectName);
  const documentUrlState = getConnectionDocumentUrlState(documentUrl);
  const effectiveDocumentUrl = documentMode === "url" && documentUrlState.status === "valid"
    ? documentUrlState.url
    : "";
  const folderPrompt = buildCodexFolderPrompt({ projectName: cleanProjectName, publicUrl });
  const connectionPrompt = buildCodexConnectionPrompt({
    projectName: cleanProjectName,
    publicUrl,
    documentUrl: effectiveDocumentUrl
  });
  const auditPrompt = buildCodexAuditPrompt({
    projectName: cleanProjectName,
    publicUrl,
    documentUrl: effectiveDocumentUrl
  });
  const connectionPromptDisabled = !cleanProjectName
    || (documentMode === "url" && documentUrlState.status !== "valid");

  return (
    <div className="manual-setup-guide">
      <p className="manual-setup-lead"><Cloud size={19} /><span><b>録音やSEの本体はGoogle Driveへ保存します。</b>WordPressにはファイル本体を置かず、共有URLと制作状況だけを登録すると、サーバー容量を圧迫しません。</span></p>

      <section className="manual-setup-subsection">
        <div className="manual-setup-heading"><FolderOpen size={18} /><div><h4>おすすめのGoogle Drive構成</h4><p>全部を必ず作る必要はありません。収録だけなら「作品の親フォルダー」と「02_収録音源／キャラクター別」から始められます。</p></div></div>
        <pre className="manual-folder-tree">{FOLDER_TREE}</pre>
        <div className="manual-table-scroll manual-setup-table">
          <table>
            <thead><tr><th>必要度</th><th>フォルダー</th><th>用途</th><th>作る時期</th><th>ツールの登録先</th></tr></thead>
            <tbody>{DRIVE_FOLDER_ROWS.map((row) => <tr key={row[1]}>{row.map((cell, index) => <td key={`${row[1]}-${index}`}><span className={index === 0 ? `manual-need-chip need-${row[0]}` : ""}>{cell}</span></td>)}</tr>)}</tbody>
          </table>
        </div>
      </section>

      <section className="manual-setup-subsection">
        <div className="manual-setup-heading"><Laptop size={18} /><div><h4>PC側の作業フォルダー</h4><p>サイトを使うだけならPC側の専用フォルダーは不要です。Codexで更新・保守する場合だけ、作業場所とバックアップ先を決めます。</p></div></div>
        <div className="manual-table-scroll manual-local-table">
          <table>
            <thead><tr><th>必要度</th><th>名前</th><th>用途</th></tr></thead>
            <tbody>{LOCAL_FOLDER_ROWS.map((row) => <tr key={row[1]}>{row.map((cell, index) => <td key={`${row[1]}-${index}`}><span className={index === 0 ? "manual-need-chip" : ""}>{cell}</span></td>)}</tr>)}</tbody>
          </table>
        </div>
        <p className="manual-note"><CircleHelp size={17} />Googleフォーム回答の音声アップロード先と、PCフォーム仕上げのプロファイルは自動作成されます。これらを手動で作ったり、名前を変更したりする必要はありません。</p>
      </section>

      <section className="manual-setup-subsection">
        <div className="manual-setup-heading"><DatabaseBackup size={18} /><div><h4>Codexにまとめて準備してもらう</h4><p>作品名を入力してボタンを押すだけです。指示文を直接書き換える必要はありません。Google Driveへ接続できる状態か、Googleにログイン済みのChromeが必要です。</p></div></div>
        <CopyablePrompt
          title="1. 保存先をまとめて作る"
          description="作品名を入れると、Drive構成・URL一覧・共有範囲を確認する指示文が自動で完成します。"
          value={folderPrompt}
          disabled={!cleanProjectName}
        >
          <label className="manual-project-name-field">
            <span><b>作品名</b><small>現在の収録プロジェクト名を入れています。必要な場合だけ変更してください。</small></span>
            <input
              type="text"
              value={projectName}
              placeholder="例：Umbrella Parade：雨を晴らせない男の復活劇"
              onChange={(event) => setProjectName(event.target.value)}
            />
          </label>
          {!cleanProjectName && <p className="manual-input-warning"><CircleHelp size={16} />作品名を入力するとコピーできるようになります。</p>}
        </CopyablePrompt>
        <CopyablePrompt
          title="2. 外部接続を設定する"
          description="通常はURL入力不要です。作品名から接続情報ドキュメントをCodexが探します。"
          value={connectionPrompt}
          disabled={connectionPromptDisabled}
        >
          <div className="manual-connection-source">
            <p className="manual-auto-source"><CheckCircle2 size={17} /><span><b>公開サイトURLは自動入力済み</b><code>{publicUrl || "現在の画面から確認します"}</code></span></p>
            <div className="manual-document-mode" role="radiogroup" aria-label="接続情報ドキュメントの指定方法">
              <label className={documentMode === "search" ? "active" : ""}>
                <input type="radio" name="manual-document-mode" value="search" checked={documentMode === "search"} onChange={() => setDocumentMode("search")} />
                <span><b>作品名から自動で探す</b><small>おすすめ・URL入力なし</small></span>
              </label>
              <label className={documentMode === "url" ? "active" : ""}>
                <input type="radio" name="manual-document-mode" value="url" checked={documentMode === "url"} onChange={() => setDocumentMode("url")} />
                <span><b>URLを指定する</b><small>同名の文書が複数ある時だけ</small></span>
              </label>
            </div>
            {documentMode === "search" ? (
              <p className="manual-connection-help"><Sparkles size={16} />上の「保存先をまとめて作る」で作成した文書を、作品名と保存場所からCodexが探します。</p>
            ) : (
              <div className="manual-document-url-field">
                <div><b>接続情報GoogleドキュメントのURL</b><a href="https://drive.google.com/drive/u/0/my-drive" target="_blank" rel="noreferrer">Google Driveを開く<ExternalLink size={14} /></a></div>
                <input
                  type="url"
                  value={documentUrl}
                  placeholder="Googleドキュメントを開き、アドレスバーのURLをそのまま貼り付け"
                  aria-invalid={documentUrlState.status === "invalid"}
                  onChange={(event) => setDocumentUrl(event.target.value)}
                />
                <p className={`manual-url-status is-${documentUrlState.status}`}><CircleHelp size={15} />{documentUrlState.message}</p>
              </div>
            )}
          </div>
        </CopyablePrompt>
        <CopyablePrompt
          title="3. 準備漏れを監査する"
          description="作品名と接続方法を反映し、既存データを変更せず不足だけを洗い出します。"
          value={auditPrompt}
          disabled={connectionPromptDisabled}
        />
      </section>
    </div>
  );
}

function AccessSetupGuide() {
  return (
    <div className="manual-setup-guide">
      <p className="manual-security-band"><LockKeyhole size={19} /><span><b>普段使うパスワードはCodexへ渡しません。</b>WordPressは個別に失効できるアプリケーションパスワードを使い、Google・X・WordPressのメインパスワード、2段階認証コード、復旧コードはGoogleドキュメントにも書かないでください。</span></p>

      <section className="manual-setup-subsection">
        <div className="manual-setup-heading"><FileText size={18} /><div><h4>オーナー限定の接続情報ドキュメント</h4><p>Googleドキュメントを1つ作り、リンク共有をオフにしてオーナーだけが見られる状態にします。CodexへURLを渡せば、接続済みGoogle Driveまたはログイン済みブラウザから必要な項目を確認できます。</p></div></div>
        <ul className="manual-security-list">
          <li>APIキーや共有シークレットを一時的に書く場合は、設定完了後に全文を消し「設定済み・末尾4文字・再発行先」だけ残します。</li>
          <li>WordPressアプリケーションパスワードはCodex用に新しく発行し、作業後に失効できます。</li>
          <li>Google Driveの親・収録・SE・フォーム・画像フォルダーURLと、見本フォームURLは残しておくと、次回の更新が速くなります。</li>
          <li>Codexには「秘密を会話や最終報告へ表示しない」と明記します。</li>
        </ul>
        <CopyablePrompt title="接続情報ドキュメントのひな形" description="このひな形をGoogleドキュメントへ貼り、使う項目だけ埋めます。" value={CONNECTION_DOC_TEMPLATE} label="ひな形をコピー" />
      </section>

      <section className="manual-setup-subsection">
        <div className="manual-setup-heading"><KeyRound size={18} /><div><h4>このツールで使うAPI・接続の取得方法</h4><p>すべてを契約・設定する必要はありません。利用したい機能の項目だけ準備します。</p></div></div>
        <div className="manual-api-list">
          {API_GUIDES.map((guide) => (
            <article id={`manual-api-${guide.id}`} key={guide.id}>
              <header>
                <div><h5>{guide.name}</h5><p>{guide.need}</p></div>
                <a className="secondary" href={guide.link} target="_blank" rel="noreferrer">{guide.linkLabel}<ExternalLink size={15} /></a>
              </header>
              <p className="manual-api-location"><Settings size={15} /><span><b>設定場所：</b>{guide.location}</span></p>
              <ol>{guide.steps.map((step) => <li key={step}>{step}</li>)}</ol>
              <p className="manual-note"><ShieldCheck size={17} />{guide.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="manual-setup-subsection">
        <div className="manual-setup-heading"><CheckCircle2 size={18} /><div><h4>APIキーを取得しなくてよいもの</h4><p>次の機能は、ログイン済みブラウザやApps Scriptを使うため、別のAPIキーは不要です。</p></div></div>
        <ul className="manual-no-api-list">
          <li><b>Google Drive APIキー：</b>不要。Driveとフォームの自動操作はGoogle Apps Scriptの承認で行います。</li>
          <li><b>X APIキー：</b>不要。ツールは投稿文と画像を準備し、ログイン済みのX投稿画面を開きます。最終投稿は本人が確認して行います。</li>
          <li><b>OJAD APIキー：</b>不要。アクセント辞典はOJAD検索を表示し、見つからない語はGoogle検索を開きます。</li>
          <li><b>声優さんのWordPressログイン：</b>不要。制作側から渡された専用URLで担当台本と進捗を共有します。</li>
        </ul>
      </section>
    </div>
  );
}

function ManualSections({ audience, onNavigate, defaultProjectName = "" }) {
  const sections = audience === "owner"
    ? OWNER_SECTIONS
    : [...ACTOR_SECTIONS].sort((left, right) => ACTOR_SECTION_ORDER.indexOf(left.id) - ACTOR_SECTION_ORDER.indexOf(right.id));
  return (
    <div className="manual-guide-layout">
      <nav className="manual-toc" aria-label="マニュアル目次">
        <span>目次</span>
        {sections.map(({ id, title, icon: Icon }) => <a href={`#${id}`} key={id} onClick={(event) => {
          const section = document.getElementById(id);
          if (!section) return;
          event.preventDefault();
          section.scrollIntoView({ behavior: "smooth", block: "start" });
        }}><Icon size={16} /><span>{title}</span></a>)}
      </nav>
      <div className="manual-detail-list">
        {sections.map(({ id, title, summary, icon: Icon, target, steps = [], note, kind }, index) => (
          <details className="manual-detail" id={id} key={id} open={index < 2 ? true : undefined}>
            <summary>
              <span className="manual-detail-icon"><Icon size={19} /></span>
              <span><b>{title}</b><small>{summary}</small></span>
              <ChevronDown className="manual-detail-chevron" size={19} />
            </summary>
            <div className="manual-detail-body">
              {kind === "folders" ? <FolderSetupGuide defaultProjectName={defaultProjectName} /> : kind === "access" ? <AccessSetupGuide /> : (
                <>
                  <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  {note && <p className="manual-note"><CircleHelp size={17} />{note}</p>}
                  {onNavigate && target && <button type="button" className="secondary manual-open-view" onClick={() => onNavigate(target)}>該当画面を開く<ArrowRight size={16} /></button>}
                </>
              )}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function ManualView({ viewerRole = "owner", allowAudienceSwitch = false, showTitle = true, onNavigate, defaultProjectName = "" }) {
  const defaultAudience = "actor";
  const [audience, setAudience] = useState(defaultAudience);
  useEffect(() => setAudience("actor"), [viewerRole]);
  const intro = useMemo(() => audience === "owner"
    ? "作品の準備から録音確認、バックアップまで、制作側の作業を順番に確認できます。"
    : "声優さんが実際に使う画面と、録音から完了報告までの手順を最初にまとめています。", [audience]);
  const navigate = onNavigate
    ? (target) => onNavigate(viewerRole === "actor" ? target : target === "script" ? "recording" : target)
    : undefined;

  return (
    <div className="manual-view">
      {showTitle && <SectionTitle title="マニュアル" subtitle="声優さんが収録で使う手順を最初に、制作側の操作を後半にまとめています。" />}
      <section className="manual-intro">
        <div className="manual-intro-copy"><BookOpen size={24} /><div><span>{audience === "owner" ? "制作ガイド" : "声優さんガイド"}</span><p>{intro}</p></div></div>
        {allowAudienceSwitch && (
          <div className="manual-audience-switch" role="tablist" aria-label="読む人を選択">
            <button type="button" role="tab" aria-selected={audience === "actor"} className={audience === "actor" ? "active" : ""} onClick={() => setAudience("actor")}><Users size={17} />声優さん向け</button>
            <button type="button" role="tab" aria-selected={audience === "owner"} className={audience === "owner" ? "active" : ""} onClick={() => setAudience("owner")}><ShieldCheck size={17} />制作側</button>
          </div>
        )}
      </section>
      {audience === "actor" && <ActorPriorityGuide onNavigate={navigate} />}
      <QuickStart audience={audience} />
      {audience === "owner" && <PermissionTable viewerRole={viewerRole} />}
      <ManualSections audience={audience} onNavigate={navigate} defaultProjectName={defaultProjectName} />
      <section className="manual-help-band">
        <RefreshCw size={19} />
        <div><b>表示や進捗が古いとき</b><p>一度ページを再読み込みし、声優さん用画面では上部の「最新状況を読み込む」も押してください。それでも直らない場合は、作品名・章名・操作した画面を添えて質問へ登録します。</p></div>
      </section>
    </div>
  );
}
