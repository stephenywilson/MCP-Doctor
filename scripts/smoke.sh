#!/usr/bin/env bash
set -e

PASS=0
FAIL=0
OUT_DIR="/tmp/mcp-doctor-smoke-$$"
mkdir -p "$OUT_DIR"

green() { echo -e "\033[32m✓\033[0m  $1"; }
red()   { echo -e "\033[31m✗\033[0m  $1"; FAIL=$((FAIL+1)); }
info()  { echo -e "   \033[2m$1\033[0m"; }

check() {
  local desc="$1"
  local test_cmd="$2"
  if eval "$test_cmd" > /dev/null 2>&1; then
    green "$desc"
    PASS=$((PASS+1))
  else
    red "$desc"
  fi
}

echo ""
echo "  ── MCP Doctor Smoke Test ──"
echo ""

# 1. Build
echo "  [1/11] Build"
npm run build 2>&1 | tail -5
check "TypeScript compiled to dist/" "[ -f dist/index.js ]"

# 2. Help
echo ""
echo "  [2/11] CLI --help"
check "--help exits 0" "node dist/index.js --help"

# 3. Version
echo ""
echo "  [3/11] CLI --version"
VERSION_OUT=$(node dist/index.js --version 2>&1)
check "--version outputs version string" "echo '$VERSION_OUT' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$'"
info "version: $VERSION_OUT"

# 4. Scan broken Claude config
echo ""
echo "  [4/11] Scan broken-claude-config.json"
node dist/index.js scan \
  --config examples/broken-claude-config.json \
  --out "$OUT_DIR" \
  --json 2>&1 | head -40

check "Markdown report generated" "[ -f '$OUT_DIR/MCP_DOCTOR_REPORT.md' ]"
check "HTML report generated"     "[ -f '$OUT_DIR/mcp-doctor-report.html' ]"
check "JSON report generated"     "[ -f '$OUT_DIR/mcp-doctor-report.json' ]"

# 5. Scan invalid JSON
echo ""
echo "  [5/11] Scan invalid-json-example.json"
node dist/index.js scan \
  --config examples/invalid-json-example.json \
  --out "$OUT_DIR/invalid" \
  --json 2>&1 | head -20
check "Invalid JSON scan completes" "[ -f '$OUT_DIR/invalid/MCP_DOCTOR_REPORT.md' ]"

# 6. Scan missing-env-token
echo ""
echo "  [6/11] Scan missing-env-token.json"
node dist/index.js scan \
  --config examples/missing-env-token.json \
  --out "$OUT_DIR/env" \
  --json 2>&1 | head -20
check "Env token scan completes" "[ -f '$OUT_DIR/env/MCP_DOCTOR_REPORT.md' ]"

# 7. Secrets masked in JSON output
echo ""
echo "  [7/11] Verify secrets are masked in JSON report"
if [ -f "$OUT_DIR/mcp-doctor-report.json" ]; then
  JSON_CONTENT=$(cat "$OUT_DIR/mcp-doctor-report.json")
  if echo "$JSON_CONTENT" | grep -q '"GITHUB_TOKEN": "YOUR_TOKEN_HERE"'; then
    red "Secret value was NOT masked in JSON report!"
  else
    green "Secrets are masked in JSON report"
    PASS=$((PASS+1))
  fi
else
  red "JSON report not found for masking check"
fi

UNSAFE_CFG="examples/safe-install-preview/unsafe-mcp-config.json"

# 8. preview command
echo ""
echo "  [8/11] preview command"
PREVIEW_OUT=$(node dist/index.js preview "$UNSAFE_CFG" 2>&1)
check "preview exits 0" "node dist/index.js preview '$UNSAFE_CFG'"
check "preview detects HIGH risk" "echo '$PREVIEW_OUT' | grep -q 'HIGH'"
check "preview shows server names" "echo '$PREVIEW_OUT' | grep -q 'filesystem'"

# 9. inspect command with --report
echo ""
echo "  [9/11] inspect command"
node dist/index.js inspect "$UNSAFE_CFG" --report --out "$OUT_DIR/inspect" 2>&1 | head -20
check "inspect exits 0"          "node dist/index.js inspect '$UNSAFE_CFG' --out '$OUT_DIR/inspect2'"
check "inspect --report writes file" "[ -f '$OUT_DIR/inspect/MCP_DOCTOR_SAFE_INSTALL_REPORT.md' ]"

# 10. safe-config command
echo ""
echo "  [10/11] safe-config command"
node dist/index.js safe-config "$UNSAFE_CFG" --client claude --out "$OUT_DIR/safe" 2>&1 | head -20
check "safe-config exits 0"      "node dist/index.js safe-config '$UNSAFE_CFG' --out '$OUT_DIR/safe2'"
check "safe-config writes file"  "[ -f '$OUT_DIR/safe/MCP_DOCTOR_SAFE_CONFIG.example.json' ]"

# 11. Safe config output validation
echo ""
echo "  [11/11] Validate safe config output"
SAFE_JSON="$OUT_DIR/safe/MCP_DOCTOR_SAFE_CONFIG.example.json"
if [ -f "$SAFE_JSON" ]; then
  # Must be valid JSON
  if python3 -m json.tool "$SAFE_JSON" > /dev/null 2>&1; then
    green "Safe config is valid JSON"
    PASS=$((PASS+1))
  else
    red "Safe config is NOT valid JSON"
  fi

  # Must not contain real secret values from the example
  SAFE_CONTENT=$(cat "$SAFE_JSON")
  if echo "$SAFE_CONTENT" | grep -q '"ghp_YOUR_TOKEN_HERE"'; then
    red "Secret value leaked into safe config!"
  else
    green "No raw secret values in safe config"
    PASS=$((PASS+1))
  fi

  # Must contain env var placeholders
  if echo "$SAFE_CONTENT" | grep -q '"\${'; then
    green "Safe config contains env var placeholders"
    PASS=$((PASS+1))
  else
    red "Safe config missing env var placeholders"
  fi
else
  red "Safe config file not found"
  FAIL=$((FAIL+3))
fi

# Summary
echo ""
echo "  ── Summary ──"
echo ""
if [ $FAIL -eq 0 ]; then
  echo -e "  \033[32m✅  All $PASS checks passed\033[0m"
else
  echo -e "  \033[31m❌  $FAIL check(s) failed, $PASS passed\033[0m"
  exit 1
fi
echo ""

# Cleanup
rm -rf "$OUT_DIR"
