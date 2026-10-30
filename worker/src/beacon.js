// NIST Randomness Beacon access and the rule for which pulse decides a round.
const { PULSE_WINDOW_MS } = require('../../app/js/core.js');

const NIST = 'https://beacon.nist.gov/beacon/2.0/pulse/time/next/';
// NIST publishes a pulse 60-80 s after its timestamp, so keep looking this long past the window.
const PUBLISH_ALLOWANCE_MS = 120000;
const FETCH_TIMEOUT_MS = 10000;

function parsePulse(json) {
  const p = json.pulse;
  return { pulseIndex: p.pulseIndex, timeMs: Date.parse(p.timeStamp), outputValue: p.outputValue };
}

// First pulse at or after closeMs, or null if not published yet or unreachable.
function fetchPulseFrom(closeMs, fetchFn) {
  return fetchFn(NIST + (closeMs - 1), { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    .then(res => (res.ok ? res.json().then(parsePulse) : null))
    .catch(() => null);
}

function choosePulse(closeMs, pulse, nowMs) {
  const deadline = closeMs + PULSE_WINDOW_MS;
  if (pulse && pulse.timeMs >= closeMs) {
    return pulse.timeMs <= deadline ? { status: 'ok', pulse } : { status: 'void' };
  }
  return nowMs > deadline + PUBLISH_ALLOWANCE_MS ? { status: 'void' } : { status: 'wait' };
}

module.exports = { parsePulse, fetchPulseFrom, choosePulse };
