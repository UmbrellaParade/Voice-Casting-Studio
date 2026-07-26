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
  LockKeyhole,
  MessageSquareText,
  Music2,
  RefreshCw,
  Settings,
  ShieldCheck,
  Users
} from "lucide-react";
import { SectionTitle } from "./ui.jsx";
import "../manual.css";

const OWNER_STEPS = [
  ["1", "作品と台本", "作品名を決め、章ごとに本文を登録します。"],
  ["2", "人物と配役", "キャラクター、担当声優、色、画像、収録フォルダーを整えます。"],
  ["3", "共有準備", "共有URL、締切、お知らせ、必要な素材を登録します。"],
  ["4", "収録確認", "提出された録音を聴き、OK・リテイク・保留を更新します。"]
];

const ACTOR_STEPS = [
  ["1", "担当を確認", "ホームで担当作品、締切、お知らせを確認します。"],
  ["2", "台本を読む", "章・シーン・キャラクターを選び、担当セリフを確認します。"],
  ["3", "録音を提出", "担当フォルダーへ録音を置き、台本で収録済みにチェックします。"],
  ["4", "結果を確認", "OK・リテイク・管理者メモを確認し、必要なら再提出します。"]
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
      "全セリフ、収録済み、確認OK、リテイクの件数を確認します。",
      "未確認録音、未回答の質問、直近の予定から優先する作業を開きます。"
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
      "録音を再生し、確認状況を「OK」「リテイク」「保留」から選びます。",
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
      "キャラクター名、担当声優、表示色、プロフィール、バックグラウンドを登録します。",
      "画像はアップロード後に位置と拡大率を調整し、顔が見やすい位置で保存します。",
      "キャラクターごとのGoogle Drive収録フォルダーURLを登録します。",
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
      "「収録フォルダー一覧」で、キャラクターとGoogle Driveフォルダーの対応を確認します。",
      "作品全体で共有する資料、連絡先、LINEオープンチャットなどは「共有URL」へ追加します。",
      "声優さんには担当キャラクターの収録フォルダーだけが表示されます。"
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
      "回答を書いたら「回答済み」、対応が完了したら「解決済み」へ変更します。",
      "台本変更が必要な質問は、先に保存版を残してから台本を更新します。"
    ]
  },
  {
    id: "owner-schedule",
    title: "予定とお知らせを共有する",
    summary: "収録締切、公開予定、編集状況、全体連絡を同じ場所で更新します。",
    icon: ListChecks,
    target: "schedule",
    steps: [
      "収録締切、公開予定日、編集状況を設定します。",
      "章別の締切や確認日などは「制作予定」として追加します。",
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
    summary: "ログイン後は、締切と自分に関係する更新を最初に確認します。",
    icon: LayoutDashboard,
    target: "home",
    steps: [
      "担当作品を選び、収録済み、確認待ち、リテイク、質問の件数を確認します。",
      "お知らせと直近の予定を読み、締切や台本変更がないか確認します。",
      "情報が古いときは、画面上部の再読み込みボタンで最新状況を取得します。"
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
      "人物を1人選ぶと、通常・ナレーション・心の声・イヤモニを含む、その人物の全セリフが表示されます。",
      "自分だけを選ぶと担当セリフ、複数人を選ぶと掛け合いをまとめて確認できます。",
      "前後の文脈が必要なときは、全文表示や前後のセリフ表示へ戻して確認します。"
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
      "担当セリフの「このセリフは収録済み」にチェックします。チェックすると自動保存されます。",
      "リテイク後にチェックすると「再提出済み」として共有されます。"
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
      "「未確認」は管理者の確認待ち、「OK」は確認完了です。",
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
      "回答を確認したあとも不明点が残る場合は、状況が分かる内容で追加の質問を登録します。"
    ]
  },
  {
    id: "actor-schedule",
    title: "締切とお知らせを確認する",
    summary: "収録締切、公開予定、制作状況を全員で同じ画面から確認します。",
    icon: ListChecks,
    target: "schedule",
    steps: [
      "収録締切と直近の制作予定を確認します。",
      "予定やお知らせは制作オーナーが更新します。声優アカウントから追加・編集・削除はできません。"
    ]
  }
];

const PERMISSION_ROWS = [
  ["共有情報・担当台本を見る", "可", "可", "可"],
  ["録音を提出する", "可", "可", "担当分のみ"],
  ["録音のOK・リテイクを付ける", "可", "可", "不可"],
  ["台本の追加・編集・削除・入れ替え", "可", "不可", "不可"],
  ["キャラクター・素材・予定を編集する", "可", "不可", "不可"],
  ["質問する", "可", "可", "可"],
  ["質問へ管理者回答を付ける", "可", "可", "不可"]
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
  const sections = audience === "owner" ? OWNER_SECTIONS : ACTOR_SECTIONS;
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
  const defaultAudience = viewerRole === "actor" ? "actor" : "owner";
  const [audience, setAudience] = useState(defaultAudience);
  useEffect(() => setAudience(defaultAudience), [defaultAudience]);
  const intro = useMemo(() => audience === "owner"
    ? "作品の準備から録音確認、バックアップまで、制作側の作業を順番に確認できます。"
    : "担当台本の確認から録音提出、リテイク対応まで、声優さんの作業を順番に確認できます。", [audience]);
  const navigate = onNavigate
    ? (target) => onNavigate(viewerRole === "actor" ? target : target === "script" ? "recording" : target)
    : undefined;

  return (
    <div className="manual-view">
      {showTitle && <SectionTitle title="マニュアル" subtitle="Voice Cast Studioの操作と権限を、役割別に確認できます。" />}
      <section className="manual-intro">
        <div className="manual-intro-copy"><BookOpen size={24} /><div><span>{audience === "owner" ? "制作ガイド" : "声優さんガイド"}</span><p>{intro}</p></div></div>
        {allowAudienceSwitch && (
          <div className="manual-audience-switch" role="tablist" aria-label="読む人を選択">
            <button type="button" role="tab" aria-selected={audience === "owner"} className={audience === "owner" ? "active" : ""} onClick={() => setAudience("owner")}><ShieldCheck size={17} />制作側</button>
            <button type="button" role="tab" aria-selected={audience === "actor"} className={audience === "actor" ? "active" : ""} onClick={() => setAudience("actor")}><Users size={17} />声優さん</button>
          </div>
        )}
      </section>
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
