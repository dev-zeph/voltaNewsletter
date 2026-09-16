#!/usr/bin/env bash
# PreToolUse guard: src/lib/types.ts is the shared contract that four parallel
# agents build against. If one of them "fixes" a type, the other three break in
# ways that only show up at integration. Block the write, explain why.
set -euo pipefail
payload="$(cat)"
path="$(printf '%s' "$payload" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null || echo "")"
case "$path" in
  */src/lib/types.ts)
    cat <<'MSG'
{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"src/lib/types.ts is the locked build contract. Four agents import from it in parallel. If a type genuinely needs to change, stop and raise it with the orchestrator instead of editing it here."}}
MSG
    ;;
  *) exit 0 ;;
esac
