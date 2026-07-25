# Voice Casting Studio WordPress設置手順

## 構成

サブドメイン専用のカスタムテーマとしてVoice Casting Studioを動かします。WordPress本体のファイルは変更しません。

- WordPress: ログイン、ユーザー、権限、作品データ、更新履歴を担当
- Voice Casting Studioテーマ: ホーム、台本、キャラクター、素材、質問、予定の全画面を担当
- Google Drive: 声優さんの録音、主題歌、BGM、SE、完成音源を保存
- WordPressメディア: キャラクター画像、サムネイル画像だけを保存

WordPressへ録音ファイル本体は保存しません。作品データにはGoogle Drive URLとファイル名だけが入ります。REST APIも埋め込み音声データを拒否します。

## 事前準備

1. サブドメインへWordPressを新規設置する。
2. HTTPSを有効にする。
3. 検索エンジンのインデックスを無効にする。
4. WordPressとサーバーのバックアップを有効にする。
5. キャッシュ機能では、ログイン中のページとREST APIをキャッシュ対象外にする。

## テーマを作る

リポジトリ直下で実行します。

```bash
npm install
npm run build:wordpress
```

生成先:

```text
wordpress-theme/voice-casting-studio
```

このフォルダーをZIPにして、WordPress管理画面の「外観 > テーマ > 新規追加 > テーマのアップロード」から入れます。テーマを有効化すると次の役割が追加されます。

- `Voice Director`: 全作品の編集、画像アップロード、声優アカウント連携
- `Voice Actor`: 担当作品の閲覧、担当セリフの状態・Drive URL・提出メモの更新、質問投稿
- `Administrator`: Voice Directorと同じ管理権限

## 最初の設定

1. 管理者でサブドメインへログインする。
2. キャラクターページで担当声優を追加する。
3. WordPress管理画面で声優さんのユーザーを作り、役割を`Voice Actor`にする。
4. Voice Casting Studioのキャラクターページで、担当声優の「WordPressアカウント」を選ぶ。
5. 各キャラクターへGoogle Drive収録フォルダーURLとLINEオープンチャットURLを登録する。
6. 台本を再取り込みし、章とシーンのプレビューを確認して反映する。

声優さんがログインすると、紐づいた担当作品だけが表示されます。全作品データ、同期トークン、他メンバーの連絡先、他の役の録音URL・収録フォルダー・個別質問はREST APIから返しません。

## Google Driveの共有

録音フォルダーはキャラクターごとに作成します。

```text
作品名/
  第一章/
    ヴェル/
    アマモリ/
  第二章/
    ヴェル/
```

情報漏洩を避けるため、「リンクを知っている全員」にはしません。各声優さんが使うGoogleアカウントを閲覧者または編集者として個別に追加します。WordPressのログインアカウントとGoogleアカウントは別物なので、両方のアクセス権を設定します。

録音提出ではGoogle Driveの共有URLだけを登録します。WordPress側のAPIは`drive.google.com`または`docs.google.com`以外の録音URLを受け付けません。

## 台本の書式

Googleドキュメントでは、章見出しの下へシーン見出しを置きます。

```text
第一章
シーン1 雨上がり
ヴェル「行こう。」

シーン2 駅前
アマモリ「待って。」

第二章
シーン1 再会
ヴェル「ただいま。」
```

画面では次の順に階層を下ります。

```text
ボイスドラマ脚本全文
  第一章
    章の全文
    シーン1 雨上がり
    シーン2 駅前
  第二章
    章の全文
    シーン1 再会
```

同じ「シーン1」が複数章にあっても、章IDとシーンIDが別になるため同時には選択されません。台本の再取り込みでは章・シーン・話者・本文が一致する行を優先し、その後に話者と本文が同じ行を照合するため、移動したセリフの録音進捗も可能な範囲で保持します。

## 保存と権限

- 管理者の編集は約1秒後にWordPressへ自動保存されます。
- 声優さんの提出直後に管理者が編集しても、より新しい録音状態・Drive URL・提出メモと新着質問を残して保存します。
- 作品JSONは非公開の`vcs_workspace`投稿へ保存されます。
- WordPressの投稿リビジョンで過去の作品JSONが残ります。
- 声優さんは作品JSON全体を保存できません。
- 声優さんが変更できるのは、担当キャラクターの収録状態、Google Drive URL、提出メモだけです。
- 質問はログイン中のWordPressユーザー名で記録されます。
- JPEG、PNG、WebP画像だけがWordPressメディアへアップロードできます。

## 更新

コード更新後に再度ビルドします。

```bash
npm run build:wordpress
```

`wordpress-theme/voice-casting-studio`をZIPにし、サーバー上の同テーマを更新します。作品データはWordPressデータベース側にあるため、テーマを更新しても消えません。

## REST API

テーマはログインCookieとWordPress REST nonceを使います。

- `GET /wp-json/voice-casting-studio/v1/workspace`: ログイン中の閲覧データ
- `POST /wp-json/voice-casting-studio/v1/workspace`: 管理者だけが作品全体を保存
- `POST /wp-json/voice-casting-studio/v1/line`: 担当セリフまたは管理者の進捗更新
- `POST /wp-json/voice-casting-studio/v1/question`: ログインメンバーの質問投稿
- `POST /wp-json/voice-casting-studio/v1/image`: 管理者の画像アップロード

すべてのエンドポイントに`permission_callback`があり、録音ファイルを受け取るエンドポイントはありません。
