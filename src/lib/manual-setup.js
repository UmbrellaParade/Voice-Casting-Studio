export function normalizeManualProjectName(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function normalizeManualUrl(value) {
  return String(value ?? "").trim();
}

export function getConnectionDocumentUrlState(value) {
  const url = normalizeManualUrl(value);
  if (!url) return { status: "empty", message: "GoogleドキュメントのURLを貼り付けてください。" };

  try {
    const parsed = new URL(url);
    const isGoogleDocument = parsed.protocol === "https:"
      && parsed.hostname === "docs.google.com"
      && parsed.pathname.startsWith("/document/d/");
    if (!isGoogleDocument) {
      return {
        status: "invalid",
        message: "Googleドキュメントを開いた画面のURL（https://docs.google.com/document/d/...）を貼り付けてください。"
      };
    }
    return { status: "valid", message: "接続情報ドキュメントとして使えるURLです。", url: parsed.href };
  } catch {
    return { status: "invalid", message: "URLを手入力せず、ブラウザ上部のアドレスバーから全部コピーして貼り付けてください。" };
  }
}

function projectLabel(projectName) {
  return normalizeManualProjectName(projectName) || "（作品名未入力）";
}

function publicSiteLabel(publicUrl) {
  return normalizeManualUrl(publicUrl) || "現在開いているVoice Cast StudioのURLをCodex側で確認";
}

function connectionDocumentLocator({ projectName, documentUrl }) {
  const state = getConnectionDocumentUrlState(documentUrl);
  if (state.status === "valid") return `指定URLを使用：${state.url}`;
  const name = projectLabel(projectName);
  return `Google Drive内で親フォルダー「${name}_Voice Cast Studio」を検索し、その中の「01_台本・共有資料／Voice Cast Studio 接続情報（オーナー限定）」を使用`;
}

export function buildCodexFolderPrompt({ projectName, publicUrl = "" } = {}) {
  const name = projectLabel(projectName);
  const site = publicSiteLabel(publicUrl);
  return `Voice Cast Studioの初期保存先を準備してください。

作品名：${name}
Voice Cast Studio公開URL：${site}

Google Driveのマイドライブ直下へ「${name}_Voice Cast Studio」という親フォルダーを作ってください。同名フォルダーがすでにある場合は重複作成せず、中身を確認してから不足分だけを追加してください。

次の構成でGoogle Driveへフォルダーと必要なファイルを作ってください。
01_台本・共有資料、02_収録音源とキャラクター別フォルダー、03_SEと章別フォルダー、04_オーディション内のフォーム・生成画像、05_確定素材内の主題歌・BGM・SE・完成音源・サムネイル、99_バックアップ。

「01_台本・共有資料」には「Voice Cast Studio 接続情報（オーナー限定）」というGoogleドキュメントも作り、接続情報のひな形を入れてください。公開URLから台本の章名とキャラクター名を確認できる場合は、それぞれの章別・キャラクター別フォルダー名へ反映してください。確認できない場合は推測せず、親フォルダーまで作成して不足項目として報告してください。

共有権限は初期状態を「制限付き」にし、収録フォルダーだけ必要な声優さんを編集者へ追加してください。「リンクを知っている全員」に変更する場合は、変更前に僕へ確認してください。接続情報ドキュメントはオーナー以外へ共有しないでください。

作成後は、名前・用途・URL・フォルダーID・共有範囲を表で報告してください。サイトへ接続できる場合は、収録フォルダー、SE親／章別フォルダー、オーディションのフォーム／画像フォルダーURLをツールの該当欄へ登録してください。既存ファイルの移動・削除・上書きはしないでください。`;
}

export function buildCodexConnectionPrompt({ projectName, publicUrl = "", documentUrl = "" } = {}) {
  const name = projectLabel(projectName);
  const site = publicSiteLabel(publicUrl);
  const locator = connectionDocumentLocator({ projectName, documentUrl });
  return `Voice Cast Studioの外部接続を設定してください。

作品名：${name}
Voice Cast Studio公開URL：${site}
接続情報ドキュメント：${locator}

まず接続情報ドキュメントを開き、値が記入されている接続だけを設定してください。ドキュメントが見つからない場合や同名ファイルが複数ある場合は、推測して進めず候補名と保存場所だけを示して僕に確認してください。

OpenAI、ElevenLabs、Google Apps Script、WordPressアプリケーションパスワードのうち、必要な情報がそろっているものだけを設定してください。秘密の値はチャット、ログ、最終報告へ全文を表示せず、サービス名・設定成否・キー末尾4文字だけを報告してください。メインのWordPressパスワード、Googleパスワード、Xパスワード、2段階認証コード、復旧コードは読み取らず、入力も保存もしないでください。

Google Apps Scriptは /exec のウェブアプリURL、見本フォームID、フォーム保存先ID、生成画像保存先ID、共有シークレットの一致を確認してください。設定後は接続テストだけを行い、課金が発生する画像・音声生成は僕の確認なしに実行しないでください。`;
}

export function buildCodexAuditPrompt({ projectName, publicUrl = "", documentUrl = "" } = {}) {
  const name = projectLabel(projectName);
  const site = publicSiteLabel(publicUrl);
  const locator = connectionDocumentLocator({ projectName, documentUrl });
  return `Voice Cast Studioの初期準備を監査してください。

作品名：${name}
公開URL：${site}
接続情報ドキュメント：${locator}

Google Driveの必要フォルダー、キャラクター別収録フォルダー、章別SEフォルダー、オーディションのフォーム／生成画像フォルダー、ツールへ登録した各URL、共有権限、OpenAI・ElevenLabs・Apps Scriptの設定状態、WordPressのバックアップ方法を確認してください。

既存データは変更・削除せず、「準備済み」「不足」「要確認」の3区分で一覧にしてください。秘密情報は伏せ、課金APIの実行や公開範囲の変更は行わないでください。最後に不足項目だけを安全な順番の作業リストにしてください。`;
}
