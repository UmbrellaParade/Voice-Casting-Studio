# Voice Casting Studio 実装メモ

## 方針

- `Radio-Article-Studio` の公開フォームと Google Apps Script 受信口の考え方を元にした。
- ラジオ記事、サムネイル、楽曲管理は外し、声優募集の応募受付に必要な機能へ絞った。
- ヘッダーは Umbrella Parade ロゴを左に置き、タイトルを `Voice Casting Studio` にした。

## 初期機能

- フォーム作成
- 録音ファイル質問の追加
- 応募期間設定
- フォーム/応募期間/既定設定ごとの Google Drive 保存先指定
- べるぼのXフォロー案内設定と公開フォームでの確認チェック
- 圧縮URL `#/s/...` の共有
- GAS公開済みフォームの短いURL `#/r/...`
- GAS経由の応募受信、録音物保存、応募一覧同期

## 運用メモ

- まずは圧縮URLで送信テストすると、`public/app-config.json` 更新前でもオンライン確認できる。
- 短いURLを使う場合は、GAS URL を `public/app-config.json` に入れてコミットする。
- 録音物は base64 を応募JSONから外し、Drive上の実ファイルを正本にする。
