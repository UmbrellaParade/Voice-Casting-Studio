# 回答受信口（Google Apps Script）セットアップ

Voice Casting Studio は GitHub Pages 上の静的アプリなので、録音物の受信と Google Drive 保存は Google Apps Script の Web アプリが担当します。

## セットアップ

1. Google Drive に回答保存先フォルダーを作ります。
2. `docs/google-apps-script/Code.gs` を Apps Script に貼り付けます。
3. 先頭の `FOLDER_ID` を既定の Drive フォルダー ID に変更します。
4. `SECRET_TOKEN` を好きな合言葉に変更します。
5. 「デプロイ」から Web アプリとして公開します。
   - 実行ユーザー: 自分
   - アクセスできるユーザー: 全員
6. 表示された Web アプリ URL をツールの設定画面に入力します。
7. 短いURL `#/r/...` を使う場合は `public/app-config.json` の `formEndpointUrl` にも同じ URL を入れてコミットします。

## 保存されるもの

```text
回答保存先フォルダー/
├─ _responses/          応募JSON
├─ _forms/              公開フォーム定義JSON
├─ 応募ログ             スプレッドシート
└─ 募集名/              録音物・画像
```

フォームまたは応募期間に Drive フォルダーURLを指定した場合、応募JSONと録音物はそのフォルダーへ保存されます。

## 動作確認

1. Web アプリ URL をブラウザで開き、`{"ok":true,...}` が出ることを確認します。
2. ツールの設定に Web アプリ URL、回答同期トークン、既定の Drive フォルダーURLを入れます。
3. 応募期間付きの圧縮URLを開き、テスト応募を送信します。
4. Drive に `_responses/` の JSON と録音物が保存されていることを確認します。
5. ツールの「新着応募を同期」で応募一覧へ取り込みます。
