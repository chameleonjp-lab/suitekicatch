'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
function extract(name) {
  const start = html.indexOf('      function ' + name + '(');
  assert.notEqual(start, -1, 'missing ' + name);
  const end = html.indexOf('\n      function ', start + 1);
  assert.notEqual(end, -1, 'missing end of ' + name);
  return html.slice(start, end);
}
function fixture(raw, options = {}) {
  const key = 'waterDropPatienceBest_v2';
  const entries = new Map([[key, raw], ['audio', 'off'], ['volume', '0'], ['suiteki_catch_player_name_v1', 'Player']]);
  if (raw === null) entries.delete(key);
  let reads = 0, writes = 0;
  const storage = {
    getItem(k) {
      reads++;
      if (options.readFails === true || options.readFails === reads) throw new Error('read blocked');
      return entries.has(k) ? entries.get(k) : null;
    },
    setItem(k, value) {
      if (options.writeFails) throw new Error('write blocked');
      writes++;
      if (!options.discardWrite) entries.set(k, value);
    }
  };
  const element = () => ({ textContent: '', classList: { toggle() {} } });
  const els = Object.fromEntries(['bestValue', 'resultTitle', 'resultBadge', 'scoreValue', 'resultMessage', 'finalJudge'].map(k => [k, element()]));
  const context = { localStorage: storage, els, t: (key, values) => key + (values ? ':' + JSON.stringify(values) : ''), getElapsedMs: () => 12000, getScoreSeconds: () => 12, showScreen: value => { context.screen = value; }, handleOnlineResult: value => { context.onlineResult = value; }, playResultAudio() {} };
  if (options.accessFails) Object.defineProperty(context, 'localStorage', { get() { throw new Error('access blocked'); } });
  vm.createContext(context);
  // Execute only inspected best-record functions and finish/render functions. No bootstrap, browser or RPC.
  const bestFunctions = html.slice(html.indexOf('      function loadBest('), html.indexOf('      function readSavedPlayerName('));
  vm.runInContext('const STORAGE_KEY="waterDropPatienceBest_v2"; const bestUpdatedResults=new WeakSet(); let gameActive=true, animationId=null, latestResult=null; const CLEAR_MS=65000, secondMessages={12:"twelve"};\n' + bestFunctions + '\n' + extract('finishGame') + '\n' + extract('renderResult') + '\nthis.marked=result=>bestUpdatedResults.has(result);', context, { timeout: 1000 });
  return { context, entries, key, options, raw: () => entries.get(key), writes: () => writes };
}
const high = '{"seconds":60,"status":"clear","message":"original","savedAt":"old","legacy":"keep"}';
const result = (seconds = 12, status = 'fail') => ({ seconds, status, message: 'new' });
for (const readFails of [1, true]) test('unreadable existing best remains byte-identical: readFails=' + readFails, () => {
  const f = fixture(high, { readFails });
  const r = result();
  assert.doesNotThrow(() => f.context.saveBest(r));
  assert.equal(f.raw(), high);
  assert.equal(f.writes(), 0);
  assert.equal(f.context.marked(r), false);
});
test('storage accessor failure does not escape or report a new best', () => {
  const f = fixture(high, { accessFails: true }), r = result();
  assert.doesNotThrow(() => f.context.saveBest(r));
  assert.doesNotThrow(() => f.context.updateBestDisplay());
  assert.equal(f.raw(), high); assert.equal(f.context.marked(r), false);
});
test('finish still renders result and continues online-result handling after failed read', () => {
  const f = fixture(high, { readFails: true });
  assert.doesNotThrow(() => f.context.finishGame('tap'));
  assert.equal(f.context.screen, 'result');
  assert.equal(f.context.els.scoreValue.textContent, 'points:{"score":12}');
  assert.equal(f.context.onlineResult.seconds, 12);
  assert.equal(f.raw(), high);
});
for (const [name, raw, seconds, status, save] of [
  ['empty record accepts zero', null, 0, 'fail', true],
  ['higher score updates', high, 61, 'fail', true],
  ['lower score preserved', high, 59, 'clear', false],
  ['equal clear preserved', high, 60, 'clear', false],
  ['clear wins tied fail', '{"seconds":60,"status":"fail"}', 60, 'clear', true],
  ['clear wins tied retire', '{"seconds":60,"status":"retire"}', 60, 'clear', true],
  ['retire does not win tied fail', '{"seconds":60,"status":"fail"}', 60, 'retire', false],
  ['invalid JSON keeps legacy replacement behavior', '{broken', 12, 'fail', true],
  ['invalid seconds keeps legacy replacement behavior', '{"seconds":"60"}', 12, 'fail', true],
  ['null record keeps legacy replacement behavior', 'null', 12, 'fail', true]
]) test(name, () => {
  const f = fixture(raw), r = result(seconds, status);
  f.context.saveBest(r);
  assert.equal(f.context.marked(r), save);
  if (save) {
    const saved = JSON.parse(f.raw());
    assert.equal(saved.seconds, seconds); assert.equal(saved.status, status); assert.equal(saved.message, 'new');
    assert.equal(typeof saved.savedAt, 'string');
  } else assert.equal(f.raw(), raw);
  assert.equal(f.entries.get('audio'), 'off'); assert.equal(f.entries.get('volume'), '0');
  assert.equal(f.entries.get('suiteki_catch_player_name_v1'), 'Player');
  assert.equal(f.entries.size, 4);
});
test('a later successful read restores normal comparison and saving', () => {
  const f = fixture(high, { readFails: 1 });
  f.context.saveBest(result()); assert.equal(f.raw(), high);
  f.context.saveBest(result(59)); assert.equal(f.raw(), high);
  const r = result(61); f.context.saveBest(r);
  assert.equal(JSON.parse(f.raw()).seconds, 61); assert.equal(f.context.marked(r), true);
});
for (const options of [{ writeFails: true }, { discardWrite: true }, { readFails: 2 }]) test('unconfirmed write never marks new-best feedback: ' + JSON.stringify(options), () => {
  const f = fixture(high, options), r = result(61);
  assert.doesNotThrow(() => f.context.saveBest(r)); assert.equal(f.context.marked(r), false);
  if (!options.readFails) assert.equal(f.raw(), high);
});
