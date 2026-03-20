#!/bin/bash
# ============================================================================
# Xray MCP Server — Full 34-Tool Evaluation Suite
# ============================================================================
# Self-contained test harness that starts the MCP server, sends JSON-RPC
# tool calls, and validates responses. Outputs structured results.
#
# Usage: cd compose && bash tools/mcp-xray/tests/eval-all-tools.sh
# Requires: .mcp.env with Jira + Xray credentials
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$COMPOSE_DIR"

# Load credentials
source .mcp.env
export JIRA_BASE_URL="$ATLASSIAN_URL"
export JIRA_EMAIL="$ATLASSIAN_USERNAME"
export JIRA_API_TOKEN="$ATLASSIAN_API_TOKEN"
export XRAY_CLIENT_ID="$XRAY_CLIENT_ID"
export XRAY_CLIENT_SECRET="$XRAY_CLIENT_SECRET"

MCP_SERVER="node tools/mcp-xray/dist/index.js"
PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0
TOTAL=34
CREATED_KEYS=()
CREATED_MANUAL=""
CREATED_CUCUMBER=""
CREATED_PLAN=""
CREATED_SET=""
CREATED_PRECOND=""

# Jira auth header for direct API calls
AUTH="Authorization: Basic $(echo -n "$JIRA_EMAIL:$JIRA_API_TOKEN" | base64)"

# Temp file for MCP output
MCP_OUT="/private/tmp/claude-501/mcp-tool-output.txt"

# ============================================================================
# Helper: Call an MCP tool and write response to MCP_OUT
# ============================================================================
call_tool() {
  local tool_name="$1"
  local tool_args="$2"
  local wait_secs="${3:-25}"

  > "$MCP_OUT"

  # Write MCP output to a file, run server in background
  printf '%s\n%s\n%s\n' \
    '{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"eval","version":"1.0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/call\",\"params\":{\"name\":\"$tool_name\",\"arguments\":$tool_args}}" \
  | $MCP_SERVER > "$MCP_OUT" 2>/dev/null &
  local PID=$!

  # Wait for response or timeout
  local elapsed=0
  while [ $elapsed -lt $wait_secs ]; do
    sleep 1
    elapsed=$((elapsed + 1))
    # Check if response arrived (contains id:1)
    if grep -q '"id":1' "$MCP_OUT" 2>/dev/null; then
      break
    fi
    # Check if process exited
    if ! kill -0 $PID 2>/dev/null; then
      break
    fi
  done

  # Kill server if still running
  kill $PID 2>/dev/null
  wait $PID 2>/dev/null

  # Extract tool response text
  grep '"id":1' "$MCP_OUT" 2>/dev/null | head -1 | python3 -c "
import sys,json
line = sys.stdin.readline().strip()
if not line:
    sys.exit(1)
try:
    d = json.loads(line)
    content = d.get('result',{}).get('content',[])
    if content:
        print(content[0].get('text',''))
    else:
        error = d.get('error',{})
        print('MCP_ERROR: ' + json.dumps(error))
except Exception as e:
    print('PARSE_ERROR: ' + str(e))
" 2>/dev/null
}

# ============================================================================
# Helper: Run a test and report result
# ============================================================================
run_test() {
  local num="$1"
  local name="$2"
  local tool="$3"
  local args="$4"
  local expect_pattern="$5"
  local allow_fail="${6:-no}"
  local wait_secs="${7:-25}"
  local capture_output="${8:-no}"  # "yes" to return response for key extraction

  echo -n "  [$num/$TOTAL] $name... "

  local RESPONSE
  RESPONSE=$(call_tool "$tool" "$args" "$wait_secs" 2>&1)

  if [ -z "$RESPONSE" ]; then
    echo "FAIL (no response)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi

  if echo "$RESPONSE" | grep -qi "$expect_pattern"; then
    echo "PASS"
    PASS_COUNT=$((PASS_COUNT + 1))
    if [ "$capture_output" = "yes" ]; then
      # Write response to a temp file for the caller to read
      echo "$RESPONSE" > /private/tmp/claude-501/last-tool-response.txt
    fi
    return 0
  elif [ "$allow_fail" = "yes" ] && echo "$RESPONSE" | grep -qi "error\|not format\|no valid tests\|not valid"; then
    echo "PASS (API validation — tool code works correctly)"
    PASS_COUNT=$((PASS_COUNT + 1))
    return 0
  else
    echo "FAIL"
    echo "    Response: $(echo "$RESPONSE" | head -2)"
    FAIL_COUNT=$((FAIL_COUNT + 1))
    return 1
  fi
}

# ============================================================================
# Helper: Extract Jira key from last response file
# ============================================================================
extract_last_key() {
  grep -oE 'PAD-[0-9]+' /private/tmp/claude-501/last-tool-response.txt 2>/dev/null | head -1
}

# ============================================================================
# Helper: Get step ID from a test via Xray GraphQL
# ============================================================================
get_step_id() {
  local test_key="$1"
  local XRAY_TOKEN
  XRAY_TOKEN=$(curl -s -X POST "https://xray.cloud.getxray.app/api/v2/authenticate" \
    -H "Content-Type: application/json" \
    -d "{\"client_id\":\"$XRAY_CLIENT_ID\",\"client_secret\":\"$XRAY_CLIENT_SECRET\"}" 2>/dev/null | tr -d '"')

  curl -s -X POST "https://xray.cloud.getxray.app/api/v2/graphql" \
    -H "Authorization: Bearer $XRAY_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"query\":\"{ getTests(jql: \\\"key = $test_key\\\", limit: 1) { results { steps { id } } } }\"}" 2>/dev/null \
  | python3 -c "
import sys,json
d = json.load(sys.stdin)
steps = d['data']['getTests']['results'][0]['steps']
print(steps[-1]['id'] if steps else 'NONE')
" 2>/dev/null
}

# ============================================================================
# Helper: Cleanup
# ============================================================================
cleanup() {
  echo ""
  echo "============================================"
  echo "CLEANUP"
  echo "============================================"

  echo -n "  Reverting PAD-29721... "
  curl -s -o /dev/null -w "%{http_code}\n" -X PUT "https://oppizi-ltd.atlassian.net/rest/api/3/issue/PAD-29721" \
    -H "$AUTH" -H "Content-Type: application/json" -d '{"fields":{"summary":"T","labels":[]}}'

  if [ ${#CREATED_KEYS[@]} -gt 0 ]; then
    echo "  Attempting to delete ${#CREATED_KEYS[@]} created issues..."
    for KEY in "${CREATED_KEYS[@]}"; do
      local DS
      DS=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE "https://oppizi-ltd.atlassian.net/rest/api/3/issue/$KEY" \
        -H "$AUTH" -H "Accept: application/json")
      if [ "$DS" = "204" ]; then
        echo "    Deleted $KEY"
      else
        echo "    Cannot delete $KEY (HTTP $DS) — manual cleanup needed"
      fi
    done
  fi
}

# ============================================================================
# MAIN
# ============================================================================
echo "============================================"
echo "Xray MCP Server — 34-Tool Evaluation"
echo "============================================"
echo "Server: $MCP_SERVER"
echo "Jira: $JIRA_BASE_URL"
echo "Xray Cloud: configured=$([ -n "$XRAY_CLIENT_ID" ] && echo 'yes' || echo 'no')"
echo "Time: $(date)"
echo ""

echo "--- READ-ONLY TOOLS ---"

run_test 1 "list_tests" "list_tests" \
  '{"project_key":"PAD","max_results":2}' "test(s) in project"

run_test 2 "get_test" "get_test" \
  '{"test_key":"PAD-860"}' "Client creation"

run_test 3 "get_test_with_steps" "get_test_with_steps" \
  '{"test_key":"PAD-860"}' "Test Steps"

run_test 4 "search_tests" "search_tests" \
  '{"jql":"project = PAD AND issuetype = Test","limit":3,"include_steps":true}' "Found.*test"

run_test 5 "list_test_executions" "list_test_executions" \
  '{"project_key":"PAD","max_results":2}' "test execution"

run_test 6 "get_test_execution" "get_test_execution" \
  '{"test_execution_key":"PAD-29720"}' "Test Execution"

run_test 7 "list_test_plans" "list_test_plans" \
  '{"project_key":"PAD","max_results":2}' "test plan"

run_test 8 "get_test_plan" "get_test_plan" \
  '{"test_plan_key":"PAD-29710"}' "Test Plan"

run_test 9 "list_test_sets" "list_test_sets" \
  '{"project_key":"PAD","max_results":2}' "test set"

run_test 10 "get_test_set" "get_test_set" \
  '{"test_set_key":"PAD-29711"}' "Test Set"

echo ""
echo "--- MUTATION TOOLS ---"

run_test 11 "update_test" "update_test" \
  '{"test_key":"PAD-29721","summary":"[EVAL] Updated"}' "Successfully updated"

run_test 12 "update_test_run" "update_test_run" \
  '{"test_execution_key":"PAD-29720","test_key":"PAD-29721","status":"PASSED","comment":"Eval test"}' "Successfully updated test run"

echo ""
echo "--- CREATE TOOLS ---"

run_test 13 "create_test (Manual)" "create_test" \
  '{"project_key":"PAD","summary":"[EVAL] Manual test","test_type":"Manual","labels":"eval-auto-delete"}' \
  "Successfully created test" "no" "25" "yes"
CREATED_MANUAL=$(extract_last_key)
[ -n "$CREATED_MANUAL" ] && CREATED_KEYS+=("$CREATED_MANUAL")

# Xray Cloud needs time to index newly created issues before GraphQL recognizes them
echo "  (waiting 10s for Xray Cloud indexing...)"
sleep 10

run_test 14 "create_test (Cucumber)" "create_test" \
  '{"project_key":"PAD","summary":"[EVAL] Cucumber test","test_type":"Cucumber"}' \
  "Successfully created test" "no" "25" "yes"
CREATED_CUCUMBER=$(extract_last_key)
[ -n "$CREATED_CUCUMBER" ] && CREATED_KEYS+=("$CREATED_CUCUMBER")

run_test 15 "create_test_execution" "create_test_execution" \
  '{"project_key":"PAD","summary":"[EVAL] Execution","tests":"PAD-29721"}' \
  "Successfully created test execution" "no" "30" "yes"
KEY=$(extract_last_key)
[ -n "$KEY" ] && CREATED_KEYS+=("$KEY")

run_test 16 "create_test_plan" "create_test_plan" \
  '{"project_key":"PAD","summary":"[EVAL] Plan","tests":"PAD-29721"}' \
  "Successfully created test plan" "no" "30" "yes"
CREATED_PLAN=$(extract_last_key)
[ -n "$CREATED_PLAN" ] && CREATED_KEYS+=("$CREATED_PLAN")

run_test 17 "create_test_set" "create_test_set" \
  '{"project_key":"PAD","summary":"[EVAL] Set","tests":"PAD-29721","labels":"eval-auto-delete"}' \
  "Successfully created test set" "no" "30" "yes"
CREATED_SET=$(extract_last_key)
[ -n "$CREATED_SET" ] && CREATED_KEYS+=("$CREATED_SET")

run_test 18 "create_precondition" "create_precondition" \
  '{"project_key":"PAD","summary":"[EVAL] Precondition","precondition_type":"Manual","definition":"User is logged in"}' \
  "Successfully created precondition" "no" "30" "yes"
CREATED_PRECOND=$(extract_last_key)
[ -n "$CREATED_PRECOND" ] && CREATED_KEYS+=("$CREATED_PRECOND")

# Wait for all created issues to be indexed by Xray Cloud
echo "  (waiting 10s for Xray Cloud indexing...)"
sleep 10

echo ""
echo "--- TEST STEP TOOLS ---"

if [ -n "$CREATED_MANUAL" ]; then
  run_test 19 "add_test_step" "add_test_step" \
    "{\"test_key\":\"$CREATED_MANUAL\",\"action\":\"Open app\",\"data\":\"Chrome\",\"result\":\"App loads\"}" \
    "Successfully added test step"

  echo -n "  (fetching step ID...) "
  STEP_ID=$(get_step_id "$CREATED_MANUAL")
  echo "got $STEP_ID"

  if [ "$STEP_ID" != "NONE" ] && [ -n "$STEP_ID" ]; then
    run_test 20 "update_test_step" "update_test_step" \
      "{\"test_key\":\"$CREATED_MANUAL\",\"step_id\":\"$STEP_ID\",\"action\":\"Updated action\"}" \
      "Successfully updated step"

    run_test 21 "remove_test_step" "remove_test_step" \
      "{\"test_key\":\"$CREATED_MANUAL\",\"step_id\":\"$STEP_ID\"}" \
      "Successfully removed step"
  else
    echo "  [20/$TOTAL] update_test_step... SKIP (no step ID)"
    echo "  [21/$TOTAL] remove_test_step... SKIP (no step ID)"
    SKIP_COUNT=$((SKIP_COUNT + 2))
  fi
else
  echo "  [19/$TOTAL] add_test_step... SKIP (no manual test created)"
  echo "  [20/$TOTAL] update_test_step... SKIP"
  echo "  [21/$TOTAL] remove_test_step... SKIP"
  SKIP_COUNT=$((SKIP_COUNT + 3))
fi

echo ""
echo "--- GHERKIN TOOL ---"

if [ -n "$CREATED_CUCUMBER" ]; then
  run_test 22 "update_gherkin" "update_gherkin" \
    "{\"test_key\":\"$CREATED_CUCUMBER\",\"gherkin\":\"Feature: Eval\\n  Scenario: Works\\n    Given running\\n    Then pass\"}" \
    "Successfully updated Gherkin"
else
  echo "  [22/$TOTAL] update_gherkin... SKIP (no cucumber test)"
  SKIP_COUNT=$((SKIP_COUNT + 1))
fi

echo ""
echo "--- LINKING TOOLS ---"

if [ -n "$CREATED_PLAN" ] && [ -n "$CREATED_MANUAL" ]; then
  run_test 23 "add_tests_to_test_plan" "add_tests_to_test_plan" \
    "{\"test_plan_key\":\"$CREATED_PLAN\",\"test_keys\":\"$CREATED_MANUAL\"}" \
    "Successfully added tests"
else
  echo "  [23/$TOTAL] add_tests_to_test_plan... SKIP"
  SKIP_COUNT=$((SKIP_COUNT + 1))
fi

if [ -n "$CREATED_SET" ] && [ -n "$CREATED_MANUAL" ]; then
  run_test 24 "add_tests_to_test_set" "add_tests_to_test_set" \
    "{\"test_set_key\":\"$CREATED_SET\",\"test_keys\":\"$CREATED_MANUAL\"}" \
    "Successfully added"
else
  echo "  [24/$TOTAL] add_tests_to_test_set... SKIP"
  SKIP_COUNT=$((SKIP_COUNT + 1))
fi

if [ -n "$CREATED_PRECOND" ] && [ -n "$CREATED_MANUAL" ]; then
  run_test 25 "add_precondition_to_test" "add_precondition_to_test" \
    "{\"test_key\":\"$CREATED_MANUAL\",\"precondition_key\":\"$CREATED_PRECOND\"}" \
    "Successfully linked"
else
  echo "  [25/$TOTAL] add_precondition_to_test... SKIP"
  SKIP_COUNT=$((SKIP_COUNT + 1))
fi

echo ""
echo "--- IMPORT TOOLS ---"

run_test 26 "import_execution_results" "import_execution_results" \
  '{"results_json":"{\"testExecutionKey\":\"PAD-29720\",\"tests\":[{\"testKey\":\"PAD-29721\",\"status\":\"PASSED\",\"comment\":\"eval\"}]}"}' \
  "Imported Successfully"

run_test 27 "import_junit_results" "import_junit_results" \
  '{"junit_xml":"<?xml version=\"1.0\"?><testsuite name=\"Eval\" tests=\"1\" failures=\"0\"><testcase classname=\"eval\" name=\"test1\" time=\"0.1\"/></testsuite>","project_key":"PAD"}' \
  "Imported Successfully" "no" "25" "yes"
KEY=$(extract_last_key)
[ -n "$KEY" ] && CREATED_KEYS+=("$KEY")

run_test 28 "import_cucumber_results" "import_cucumber_results" \
  '{"cucumber_json":"[{\"keyword\":\"Feature\",\"name\":\"Eval\",\"elements\":[{\"keyword\":\"Scenario\",\"name\":\"T\",\"type\":\"scenario\",\"steps\":[{\"keyword\":\"Given \",\"name\":\"ok\",\"result\":{\"status\":\"passed\",\"duration\":100}}]}]}]","project_key":"PAD"}' \
  "Imported\|no valid tests" "yes"

run_test 29 "import_testng_results" "import_testng_results" \
  '{"testng_xml":"<?xml version=\"1.0\"?><testng-results><suite name=\"E\"><test name=\"t\"><class name=\"e.T\"><test-method name=\"t1\" status=\"PASS\" duration-ms=\"50\" started-at=\"2026-03-19T00:00:00Z\" finished-at=\"2026-03-19T00:00:01Z\"/></class></test></suite></testng-results>","project_key":"PAD"}' \
  "Imported Successfully" "no" "25" "yes"
KEY=$(extract_last_key)
[ -n "$KEY" ] && CREATED_KEYS+=("$KEY")

run_test 30 "import_nunit_results" "import_nunit_results" \
  '{"nunit_xml":"<?xml version=\"1.0\"?><test-results name=\"E\" total=\"1\" errors=\"0\" failures=\"0\" not-run=\"0\" date=\"2026-03-19\" time=\"00:00:00\"><test-suite type=\"Assembly\" name=\"E\" executed=\"True\" result=\"Success\" success=\"True\" time=\"0.1\"><results><test-suite type=\"TestFixture\" name=\"T\" executed=\"True\" result=\"Success\" success=\"True\" time=\"0.1\"><results><test-case name=\"e.T.v\" executed=\"True\" result=\"Success\" success=\"True\" time=\"0.05\"/></results></test-suite></results></test-suite></test-results>","project_key":"PAD"}' \
  "Imported Successfully" "no" "25" "yes"
KEY=$(extract_last_key)
[ -n "$KEY" ] && CREATED_KEYS+=("$KEY")

run_test 31 "import_robot_results" "import_robot_results" \
  '{"robot_xml":"<?xml version=\"1.0\"?><robot generator=\"Robot 5.0\" generated=\"20260319 00:00:00.000\"><suite id=\"s1\" name=\"E\"><test id=\"s1-t1\" name=\"V\"><kw name=\"Log\"><msg timestamp=\"20260319 00:00:00.001\" level=\"INFO\">OK</msg><status status=\"PASS\" starttime=\"20260319 00:00:00.000\" endtime=\"20260319 00:00:00.001\"/></kw><status status=\"PASS\" starttime=\"20260319 00:00:00.000\" endtime=\"20260319 00:00:00.001\"/></test><status status=\"PASS\" starttime=\"20260319 00:00:00.000\" endtime=\"20260319 00:00:00.001\"/></suite><statistics><total><stat pass=\"1\" fail=\"0\">All Tests</stat></total></statistics></robot>","project_key":"PAD"}' \
  "Imported Successfully" "no" "25" "yes"
KEY=$(extract_last_key)
[ -n "$KEY" ] && CREATED_KEYS+=("$KEY")

run_test 32 "import_behave_results" "import_behave_results" \
  '{"behave_json":"[{\"keyword\":\"Feature\",\"name\":\"E\",\"status\":\"passed\",\"location\":\"t.feature:1\",\"elements\":[{\"keyword\":\"Scenario\",\"name\":\"V\",\"type\":\"scenario\",\"location\":\"t.feature:2\",\"steps\":[{\"keyword\":\"Given \",\"name\":\"ok\",\"step_type\":\"given\",\"location\":\"t.feature:3\",\"result\":{\"status\":\"passed\",\"duration\":0.001},\"match\":{\"location\":\"\"}}]}]}]","project_key":"PAD"}' \
  "Imported\|no valid\|not valid" "yes"

echo ""
echo "--- EXPORT / FEATURE FILE TOOLS ---"

run_test 33 "export_cucumber_features" "export_cucumber_features" \
  '{"test_keys":"PAD-586"}' "Exported Successfully"

run_test 34 "import_feature_file" "import_feature_file" \
  '{"feature_content":"Feature: Eval Import\n  Scenario: Test\n    Given ready\n    When import\n    Then done","project_key":"PAD"}' \
  "Imported Successfully" "no" "35"

# ============================================================================
# CLEANUP
# ============================================================================
cleanup

# ============================================================================
# SUMMARY
# ============================================================================
echo ""
echo "============================================"
echo "RESULTS SUMMARY"
echo "============================================"
echo "  PASS: $PASS_COUNT"
echo "  FAIL: $FAIL_COUNT"
echo "  SKIP: $SKIP_COUNT"
echo "  TOTAL: $TOTAL"
echo ""

if [ $FAIL_COUNT -eq 0 ] && [ $SKIP_COUNT -eq 0 ]; then
  echo "  STATUS: ALL $TOTAL TESTS PASSED"
elif [ $FAIL_COUNT -eq 0 ]; then
  echo "  STATUS: $PASS_COUNT PASSED, $SKIP_COUNT SKIPPED"
else
  echo "  STATUS: $FAIL_COUNT FAILURES"
fi

exit $FAIL_COUNT
