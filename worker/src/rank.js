const { closeness, fromHex } = require('../../app/js/core.js');

// Best first; equal closeness goes to the earlier submit.
function rankPicks(picks, targetRgb) {
  return picks
    .map(p => Object.assign({}, p, { closeness: closeness(fromHex(p.hex), targetRgb) }))
    .sort((a, b) => b.closeness - a.closeness || a.submittedAt - b.submittedAt)
    .map((p, i) => Object.assign(p, { rank: i + 1 }));
}

module.exports = { rankPicks };
