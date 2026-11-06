#!/usr/bin/env bash
# Smoke test for the Worker API. Usage: bash test/api.smoke.sh [baseUrl]
BASE="${1:-http://127.0.0.1:8787}"
PASS=0; FAIL=0
check() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "ok   $1"; else FAIL=$((FAIL+1)); echo "FAIL $1 (want $3, got $2)"; fi; }
json() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const v=JSON.parse(s);console.log(eval('v'+process.argv[1]))}catch(e){console.log('PARSE_ERROR')}})" "$1"; }
post() { curl -s -o /tmp/qt_body -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d "$1" "$BASE/pick"; }

PLAYER="smoke-$(date +%s%N | tail -c 9)"
OPEN=$(curl -s "$BASE/now" | json .openRoundId)
check "/now returns openRoundId" "$([ "$OPEN" -gt 0 ] 2>/dev/null && echo yes)" yes

check "pick open round" "$(post "{\"playerId\":\"$PLAYER\",\"nickname\":\"SMOKE\",\"roundId\":$OPEN,\"hex\":\"#C8263F\"}")" 200
check "second pick same round" "$(post "{\"playerId\":\"$PLAYER\",\"nickname\":\"SMOKE\",\"roundId\":$OPEN,\"hex\":\"#000000\"}")" 409
check "second pick error" "$(json .error < /tmp/qt_body)" already_picked

OLD=$((OPEN - 300000))
check "pick closed round" "$(post "{\"playerId\":\"$PLAYER-2\",\"nickname\":\"SMOKE\",\"roundId\":$OLD,\"hex\":\"#C8263F\"}")" 409
check "closed round names open round" "$(json .openRoundId < /tmp/qt_body)" "$OPEN"

check "bad hex" "$(post "{\"playerId\":\"$PLAYER-3\",\"nickname\":\"SMOKE\",\"roundId\":$OPEN,\"hex\":\"red\"}")" 400
check "bad nickname" "$(post "{\"playerId\":\"$PLAYER-4\",\"nickname\":\"x\",\"roundId\":$OPEN,\"hex\":\"#C8263F\"}")" 400

check "round shows open status" "$(curl -s "$BASE/round/$OPEN?player=$PLAYER" | json .status)" open

PR=$(curl -s "$BASE/practice")
check "practice gives 3 channels in range" "$(echo "$PR" | json '.rgb.filter(x=>Number.isInteger(x)&&x>=0&&x<=255).length')" 3

check "day board has top array" "$(curl -s "$BASE/board/day?player=$PLAYER" | json '.top instanceof Array')" true
check "unknown board period" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/board/month")" 404
check "live picks refused before picking" "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/round/$OPEN/picks?player=$PLAYER-9")" 403
check "live picks after picking include mine" "$(curl -s "$BASE/round/$OPEN/picks?player=$PLAYER" | json '.picks.some(p=>p.mine)')" true
check "round stats pending for an open round" "$(curl -s "$BASE/stats/round/$OPEN" | json .status)" pending
check "all stats has a series array" "$(curl -s "$BASE/stats/all" | json '.series instanceof Array')" true

check "CORS header" "$(curl -s -D - -o /dev/null "$BASE/now" | tr -d '\r' | grep -i '^access-control-allow-origin:' | awk '{print $2}')" '*'

echo "pass $PASS fail $FAIL"
[ "$FAIL" -eq 0 ]
