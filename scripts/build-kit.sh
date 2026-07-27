#!/usr/bin/env bash
#
# 配布用キットの zip を作る。
#
#   ./scripts/build-kit.sh
#   → release/know-how-execution-kit.zip
#
# 中身： ai-company/ 一式 ＋ claude-code-textbook.md
# 除外： 作者用の引き継ぎメモ、作業中の生成物、OS のゴミファイル
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/release/know-how-execution-kit.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

KIT="$STAGE/know-how-execution-kit"
mkdir -p "$KIT"

# キット本体（隠しディレクトリ .claude を含めるため -a ではなく明示コピー）
cp -R "$ROOT/ai-company/." "$KIT/"

# 読む用の教科書を同梱（キット内から ../claude-code-textbook.md で参照されるため
# 直下ではなく1つ上に置く構成にせず、キット直下へコピーしたうえでリンクを直す）
cp "$ROOT/claude-code-textbook.md" "$KIT/claude-code-textbook.md"
sed -i.bak 's|(\.\./claude-code-textbook\.md)|(claude-code-textbook.md)|g' "$KIT/README.md"
rm -f "$KIT/README.md.bak"

# 前回の作業結果が混ざらないように work/ を初期状態へ戻す
find "$KIT/work" -mindepth 1 -maxdepth 1 ! -name 'README.md' ! -name 'outputs' ! -name 'drafts' ! -name 'log' -exec rm -rf {} +
for d in outputs drafts log; do
  find "$KIT/work/$d" -mindepth 1 ! -name '.gitkeep' -exec rm -rf {} +
done

# materials/ は README だけの空の状態で配る
find "$KIT/materials" -mindepth 1 ! -name 'README.md' -exec rm -rf {} +

# 変換済みの商材スキルは配らない（know-how-runner だけ残す）
find "$KIT/.claude/skills" -mindepth 1 -maxdepth 1 -type d ! -name 'know-how-runner' -exec rm -rf {} +

# 作者用メモ・OS のゴミ
find "$KIT" \( -name '.DS_Store' -o -name 'Thumbs.db' -o -name '引き継ぎメモ*' -o -name 'HANDOVER*' \) -exec rm -rf {} +

mkdir -p "$ROOT/release"
rm -f "$OUT"
( cd "$STAGE" && zip -qr "$OUT" know-how-execution-kit -x '*.DS_Store' )

echo "built: $OUT"
unzip -l "$OUT" | tail -n +4 | head -n -2
