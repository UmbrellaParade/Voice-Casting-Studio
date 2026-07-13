# Implementation Notes

Voice Casting Studio currently uses Radio Article Studio as the base codebase.

Visible workflow:

- `募集企画`: lightweight grouping for an audition project
- `Googleフォーム`: Google Form / response sheet URL management for audition submissions
- `回答取り込み`: Google Sheets / CSV import with preview, column mapping, and apply-to-responses flow
- `応募一覧`: submitted responses and attached recordings
- `設定`: Google Apps Script endpoint, Drive folder, Bellbo X follow settings, backup import/export

Hidden original modules such as tracks, thumbnails, SNS, and Codex article packs remain in the code for now, but they are not exposed in the main navigation.

The form-level `受付開始` and `受付終了` fields are the active application-period mechanism. The older separate `ApplicationPeriods` component is intentionally not exposed.
