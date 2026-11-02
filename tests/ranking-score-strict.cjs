'use strict';
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), crypto = require('node:crypto');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function extract(name) {
  const start = new RegExp('      (?:async )?function ' + name + '\\(').exec(html);
  assert.ok(start, 'actual declaration: ' + name);
  const next = /\n      (?:async )?function /g;
  next.lastIndex = start.index + 1;
  const end = next.exec(html);
  assert.ok(end, 'bounded declaration: ' + name);
  return html.slice(start.index, end.index);
}
function fixture(rows) {
  const element = () => ({ dataset: {}, textContent: '', children: [],
    set innerHTML(value) { assert.equal(value, ''); this.children = []; },
    appendChild(child) { this.children.push(child); } });
  const els = Object.fromEntries(['bestRankingList', 'firstRankingList', 'bestRankingStatus', 'firstRankingStatus'].map(key => [key, element()]));
  const calls = [];
  const context = { els, document: { createElement: element },
    setLocalized: (el, key, values = {}) => { el.textContent = key; el.values = JSON.parse(JSON.stringify(values)); },
    getSupabaseClient: () => ({ rpc: async (method, args) => { calls.push({ method, args }); return { data: rows, error: null }; } }) };
  vm.createContext(context, { codeGeneration: { strings: false, wasm: false } });
  vm.runInContext('const GAME_SLUG="suiteki_catch", rankingReadGeneration={best:0,first:0}, latestResult={}, activeParticipation={};\n' +
    ['pickNumber', 'normalizeRankingRows', 'renderRankingRows', 'isCurrentOnlineResult', 'loadBestScoreRanking', 'loadFirstTryRanking'].map(extract).join('\n') +
    '\nthis.read=mode=>mode==="best"?loadBestScoreRanking(latestResult,activeParticipation,0):loadFirstTryRanking(latestResult,activeParticipation,0);', context, { timeout: 1000 });
  return { context, els, calls };
}
const normalRow = (value, mode, rank = 1) => ({ rank_no: rank, display_name: 'same name', first_score: mode === 'first' ? value : 77, best_score: mode === 'best' ? value : 88, play_count: 2, updated_at: '2026-01-01T00:00:00Z' });
const aliases = { score: 901, result_best_score: 902, highest_score: 903, high_score: 904, max_score: 905, first_try_score: 906, result_first_score: 907, initial_score: 908 };
const results = [];
async function check(name, fn) { try { await fn(); results.push({ name, passed: true }); } catch (e) { results.push({ name, passed: false, reason: e.message }); } }
async function scores(mode, rows) {
  const f = fixture(rows); await f.context.read(mode);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, mode === 'best' ? 'get_best_score_ranking' : 'get_first_try_ranking');
  assert.equal(f.calls[0].args.p_game_slug, 'suiteki_catch');
  assert.equal(f.calls[0].args.p_limit, 30);
  return f.els[mode + 'RankingList'].children.map(el => el.values);
}
(async () => {
  for (const mode of ['best', 'first']) {
    await check(mode + ': numeric int4, zero, negatives, ties and order retained', async () => {
      const values = [-2147483648, -1, 0, 2147483647];
      const rows = await scores(mode, values.map((n, i) => normalRow(n, mode, [1, 1, 9, 3][i])));
      assert.deepEqual(rows.map(row => row.score), [-2147483648, -1, 0, 2147483647]);
      assert.deepEqual(rows.map(row => row.rank), [1, 1, 9, 3]);
      assert.deepEqual(rows.map(row => row.name), ['same name', 'same name', 'same name', 'same name']);
    });
    const invalid = [['missing', undefined], ['null', null], ['numeric string', '12'], ['empty string', ''], ['space string', ' '], ['boolean true', true], ['boolean false', false], ['fraction', 1.5], ['low overflow', -2147483649], ['high overflow', 2147483648], ['NaN', NaN], ['infinity', Infinity], ['negative infinity', -Infinity], ['array', [12]], ['object', { value: 12 }]];
    for (const [label, value] of invalid) for (const withAliases of [false, true]) await check(mode + ': ' + label + (withAliases ? ' with aliases' : ' alone') + ' is unknown', async () => {
      const row = Object.assign(normalRow(value, mode), withAliases ? aliases : {});
      if (label === 'missing') delete row[mode + '_score'];
      assert.equal((await scores(mode, [row]))[0].score, '—');
    });
    await check(mode + ': authoritative value wins over every legacy alias', async () => {
      assert.equal((await scores(mode, [Object.assign(normalRow(0, mode), aliases)]))[0].score, 0);
    });
    await check(mode + ': other tab and aliases alone never supply a score', async () => {
      const row = Object.assign(normalRow(12, mode), aliases); delete row[mode + '_score'];
      assert.equal((await scores(mode, [row]))[0].score, '—');
    });
    await check(mode + ': first 30 server rows retained without sorting', async () => {
      const rows = await scores(mode, Array.from({ length: 35 }, (_, i) => normalRow(-i, mode, 40 - i)));
      assert.equal(rows.length, 30); assert.equal(rows[29].score, -29); assert.equal(rows[29].rank, 11);
    });
  }
  console.log(JSON.stringify({ sourceSHA256: crypto.createHash('sha256').update(html).digest('hex'), cases: results.length, results, passed: results.every(row => row.passed), network: 0, wholeGameExecution: false }, null, 2));
  if (results.some(row => !row.passed)) process.exitCode = 1;
})().catch(error => { console.error(error); process.exitCode = 1; });
