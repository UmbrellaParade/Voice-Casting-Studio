# Implementation Notes

Voice Casting Studio currently uses Radio Article Studio as the base codebase.

Visible workflow:

- `募集企画`: lightweight grouping for an audition project
- `応募フォーム`: form builder, reception period, submission limit, file upload fields, short URL publishing
- `応募一覧`: submitted responses and attached recordings
- `設定`: Google Apps Script endpoint, Drive folder, Bellbo X follow settings, backup import/export

Hidden original modules such as imports, tracks, thumbnails, SNS, and Codex article packs remain in the code for now, but they are not exposed in the main navigation.

The form-level `受付開始` and `受付終了` fields are the active application-period mechanism. The older separate `ApplicationPeriods` component is intentionally not exposed.
