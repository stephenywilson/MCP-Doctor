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
echo "  [1/7] Build"
npm run build 2>&1 | tail -5
check "TypeScript compiled to dist/" "[ -f dist/index.js ]"

# 2. Help
echo ""
echo "  [2/7] CLI --help"
check "--help exits 0" "node dist/index.js --help"

# 3. Version
echo ""
echo "  [3/7] CLI --version"
VERSION_OUT=$(node dist/index.js --version 2>&1)
check "--version outputs version string" "echo '$VERSION_OUT' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$'"
info "version: $VERSION_OUT"

# 4. Scan broken Claude config
echo ""
echo "  [4/7] Scan broken-claude-config.json"
node dist/index.js scan \
  --config examples/broken-claude-config.json \
  --out "$OUT_DIR" \
  --json 2>&1 | head -40

check "Markdown report generated" "[ -f '$OUT_DIR/MCP_DOCTOR_REPORT.md' ]"
check "HTML report generated"     "[ -f '$OUT_DIR/mcp-doctor-report.html' ]"
check "JSON report generated"     "[ -f '$OUT_DIR/mcp-doctor-report.json' ]"

# 5. Scan invalid JSON
echo ""
echo "  [5/7] Scan invalid-json-example.json"
node dist/index.js scan \
  --config examples/invalid-json-example.json \
  --out "$OUT_DIR/invalid" \
  --json 2>&1 | head -20
check "Invalid JSON scan completes" "[ -f '$OUT_DIR/invalid/MCP_DOCTOR_REPORT.md' ]"

# 6. Scan missing-env-token
echo ""
echo "  [6/7] Scan missing-env-token.json"
node dist/index.js scan \
  --config examples/missing-env-token.json \
  --out "$OUT_DIR/env" \
  --json 2>&1 | head -20
check "Env token scan completes" "[ -f '$OUT_DIR/env/MCP_DOCTOR_REPORT.md' ]"

# 7. Secrets are masked in JSON output
echo ""
echo "  [7/7] Verify secrets are masked in JSON report"
if [ -f "$OUT_DIR/mcp-doctor-report.json" ]; then
  # The report should not contain any raw placeholder that equals the exact original
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
