#!/usr/bin/env bash
# PostToolUse（Bash）: PR を作ったとき、または PR のあるブランチに push したときに、/my-code-review <PR番号> を実行するよう Claude に指示する。
# hook からスキルは直接起動できないため、additionalContext で Claude に実行を促す。
# ドラフトかどうかは状況によるため問わない。
# 依存: jq, gh
# 環境変数でスキル名を差し替えられる: REVIEW_SKILL（既定 my-code-review）、FIX_SKILL（既定 address-review）

review_skill=${REVIEW_SKILL:-my-code-review}
fix_skill=${FIX_SKILL:-address-review}

input=$(cat)
cmd=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
dir=$(printf '%s' "$input" | jq -r '.cwd // empty')
dir=${dir:-$CLAUDE_PROJECT_DIR}

# コマンドの先頭、または ; & | ( の直後に来たものだけを対象にする（echo "git push" などの文字列には反応しない）
start='(^|[;&|(][[:space:]]*)'

if printf '%s' "$cmd" | grep -Eq "${start}gh[[:space:]]+pr[[:space:]]+create"; then
  # gh pr create は成功すると作成した PR の URL を標準出力に出す。URL がなければ PR は作られていないので何もしない
  output=$(printf '%s' "$input" | jq -r '.tool_response.stdout // empty')
  number=$(printf '%s' "$output" | grep -Eo '/pull/[0-9]+' | tail -1 | grep -Eo '[0-9]+')
  event="作成しました"
elif printf '%s' "$cmd" | grep -Eq "${start}git([[:space:]]+-C[[:space:]]+[^[:space:]]+)?[[:space:]]+push"; then
  # ブランチを更新しない push（dry-run・削除・タグだけ）は対象外
  printf '%s' "$cmd" | grep -Eq 'push[^;&|]*[[:space:]](--dry-run|-n|--delete|-d|--tags)([[:space:]=]|$)' && exit 0
  cd "$dir" 2>/dev/null || exit 0
  head=$(git rev-parse HEAD 2>/dev/null) || exit 0
  # push に失敗した場合は、リモートの追跡ブランチが HEAD と一致しない
  [ "$(git rev-parse '@{u}' 2>/dev/null)" = "$head" ] || exit 0
  number=$(gh pr view --json number,state -q 'select(.state == "OPEN") | .number' 2>/dev/null)
  [ -n "$number" ] || exit 0
  # 自分がこの HEAD をすでにレビューしていれば、重ねて促さない（他の人のレビューは数えない）
  me=$(gh api user -q .login 2>/dev/null)
  reviewed=$(gh api --paginate "repos/{owner}/{repo}/pulls/$number/reviews" \
    --jq ".[] | select(.commit_id == \"$head\" and .user.login == \"$me\") | .id" 2>/dev/null | wc -l | tr -d ' ')
  [ "${reviewed:-0}" -eq 0 ] || exit 0
  event="更新しました（HEAD ${head:0:7}）"
else
  exit 0
fi
[ -n "$number" ] || exit 0

jq -n --arg n "$number" --arg e "$event" --arg r "$review_skill" --arg f "$fix_skill" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("PR #" + $n + " を" + $e + "。/" + $r + " " + $n + " を実行し、レビュー結果を PR にコメントしてください（同じ HEAD のレビューをすでに実行する予定なら、重ねて実行しない）。指摘はユーザーに報告し、最後に /" + $f + " " + $n + " で指摘に対応できることを案内してください。")
  }
}'
