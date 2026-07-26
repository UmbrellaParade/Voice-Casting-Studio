import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  FileAudio,
  FileText,
  FolderOpen,
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
import "../manual.css";

const OWNER_STEPS = [
  ["1", "作品と台本", "作品名を決め、章ごとに本文を登録します。"],
  ["2", "人物と配役", "キャラクター、担当声優、担当者SNS、色、画像、収録フォルダーを整えます。"],
  ["3", "共有準備", "トップURLで共通内容を確認し、担当声優には操作できる専用URLを渡します。"],
  ["4", "収録確認", "提出された録音を聴き、OK・リテイク・保留を更新します。"]
];

const ACTOR_STEPS = [
  ["1", "専用URLを開く", "ログインは不要です。制作担当者から届いた自分専用URLでホームを開きます。"],
  ["2", "担当セリフを表示", "台本で章を選び、自分のキャラクターボタンから担当セリフを表示します。"],
  ["3", "Driveへ録音を置く", "共有リンクから担当の収録フォルダーを開き、録音ファイルをアップロードします。"],
  ["4", "レ点で完了を伝える", "アップロード後、台本の「このセリフは収録済み」にチェックします。"]
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

const OWNER_SECTIONS = [
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
      "リテイクでは、声優さんに伝わるように対象箇所と直し方を確認メモへ書きます。"
    ]
  },
  {
    id: "owner-characters",
    title: "キャラクターと配役を整える",
    summary: "人物情報と担当声優、収録先を一か所で管理します。",
    icon: Users,
    target: "characters",
    steps: [
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
    title: "素材を登録・並べ替える",
    summary: "主題歌、BGM、SE、完成音源、サムネイルを作品ごとに整理します。",
    icon: Music2,
    target: "materials",
    steps: [
      "音声素材はGoogle Driveの共有URL、サムネイルは画像を登録します。",
      "素材のつまみをドラッグして表示順を変更します。",
      "再生中の音声は画面下のプレイヤーに残り、別の画面へ移動しても再生を続けられます。",
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
    title: "未配役と制作タスクを管理する",
    summary: "担当声優が決まっていない役と、自由に追加した作業を一つの画面で確認します。",
    icon: ListTodo,
    target: "tasks",
    steps: [
      "台本にセリフがあり、担当声優名が空欄のキャラクターは「配役が決まっていない役」へ自動表示されます。",
      "キャラクター画面で担当声優名を登録すると自動で一覧から外れ、名前を外すと再び一覧へ戻ります。台本外として保存されているキャラクターは対象になりません。",
      "作成したオーディションフォームをまとめたGoogle DriveフォルダーのURLを登録すると、未配役の各役から同じフォルダーを開けます。",
      "役ごとに「フォーム作成済み」「募集開始済み」をチェックします。担当声優が決まって一度一覧から外れても、再び未配役になった場合はチェック状況が残ります。",
      "配役以外の作業は「手動タスク」へ追加し、完了チェック、優先度、任意の期日、共有メモを更新します。"
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
      "人物を選ぶと「前後のセリフも表示」が使えます。レ点を入れると、対象セリフの直前・直後を一緒に確認できます。"
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
      "リテイク時は録り直したファイルを同じ担当フォルダーへ置き、収録済みチェックを付け直すと「再提出済み」として共有されます。"
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
      "「リテイク」になった場合は確認メモを読み、録り直したファイルを担当フォルダーへ置いて再度チェックします。",
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
    summary: "登録された音源やサムネイルを種類別に確認します。",
    icon: Music2,
    target: "materials",
    steps: [
      "素材を再生すると、画面下に共通プレイヤーが表示されます。",
      "台本やキャラクターへ移動しても再生は続き、プレイヤーの停止ボタンで止められます。",
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

function ManualSections({ audience, onNavigate }) {
  const sections = audience === "owner"
    ? OWNER_SECTIONS
    : [...ACTOR_SECTIONS].sort((left, right) => ACTOR_SECTION_ORDER.indexOf(left.id) - ACTOR_SECTION_ORDER.indexOf(right.id));
  return (
    <div className="manual-guide-layout">
      <nav className="manual-toc" aria-label="マニュアル目次">
        <span>目次</span>
        {sections.map(({ id, title, icon: Icon }) => <a href={`#${id}`} key={id}><Icon size={16} /><span>{title}</span></a>)}
      </nav>
      <div className="manual-detail-list">
        {sections.map(({ id, title, summary, icon: Icon, target, steps, note }, index) => (
          <details className="manual-detail" id={id} key={id} open={index < 2 ? true : undefined}>
            <summary>
              <span className="manual-detail-icon"><Icon size={19} /></span>
              <span><b>{title}</b><small>{summary}</small></span>
              <ChevronDown className="manual-detail-chevron" size={19} />
            </summary>
            <div className="manual-detail-body">
              <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
              {note && <p className="manual-note"><CircleHelp size={17} />{note}</p>}
              {onNavigate && target && <button type="button" className="secondary manual-open-view" onClick={() => onNavigate(target)}>該当画面を開く<ArrowRight size={16} /></button>}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export function ManualView({ viewerRole = "owner", allowAudienceSwitch = false, showTitle = true, onNavigate }) {
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
      <ManualSections audience={audience} onNavigate={navigate} />
      <section className="manual-help-band">
        <RefreshCw size={19} />
        <div><b>表示や進捗が古いとき</b><p>一度ページを再読み込みし、声優さん用画面では上部の「最新状況を読み込む」も押してください。それでも直らない場合は、作品名・章名・操作した画面を添えて質問へ登録します。</p></div>
      </section>
    </div>
  );
}
