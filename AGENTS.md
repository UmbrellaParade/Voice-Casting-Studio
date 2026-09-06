# WordPress / GAS 共通開発ルール

- このリポジトリの `src/main.jsx` と `src/components` が、現在のWordPress版・GAS版の共通正本です。古いGAS専用画面へ機能を個別移植しないでください。
- 利用者の要望により、以後の機能修正は必ず両版を対象にします。画面の分岐ではなく `src/lib/workspace.js` の保存先アダプターと明示的な権限で違いを扱ってください。
- WordPressの管理用API（画像生成、フォーム作成、ElevenLabs等）とGASの共同収録APIは別です。バックエンド未対応の機能を「同等」「公開済み」と報告しないでください。
- リリース前に `npm run build:all` を実行します。共通テスト、GAS向けフロント、WordPress向けフロント、受信口を同じソースから生成し、`artifacts/paired-build/build-info.json` のハッシュ一致を確認します。
- GASフロントの公開だけで受信口は更新されません。`docs/google-apps-script` に変更がある場合は、`build:all` が生成した `artifacts/paired-build/gas-backend/Code.gs` と `appsscript.json` を使ってApps Scriptの既存デプロイを新バージョンへ更新し、URLと既存の秘密設定を保持します。分割された元のCode.gsだけを公開しないでください。WordPressだけ／GASだけの公開になった場合は未完了側を明記してください。
- 配布物へAPIキーや導入者固有の同期トークンを含めません。各制作オーナーが自分のOpenAI/ElevenLabsキーと、自分のApps Script・Drive・見本フォームを設定します。GASのスクリプトプロパティはApps Script編集者から閲覧可能なので、声優や別の制作オーナーを編集者へ追加しないでください。
- 管理者・声優2名で、チェック、リテイク、再リテイク、質問、解決、タブ移動、再読込を確認します。実作品での試験入力は禁止し、テスト作品を使ってください。
- 制作オーナー専用データ（応募者、個別連絡文、募集フォーム保管先、APIキー、アクセスキー）は声優向け応答へ渡しません。サーバーでも担当権限を検証します。
- 既存のWordPress本番データ、古いClaude作業コピー、未コミット変更を上書き・削除しないでください。本番移行は現行バックアップと復元確認後に行います。
