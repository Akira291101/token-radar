import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const input = JSON.parse(readFileSync(join(root, 'input/snapshot.json'), 'utf8'));
const boardPath = join(root, 'out/board.json');
const dataPath = join(root, 'out/data.js');
assert.ok(existsSync(boardPath), 'out/board.json is missing');
assert.ok(existsSync(dataPath), 'out/data.js is missing');

const { rows } = JSON.parse(readFileSync(boardPath, 'utf8'));
const isPreToken = (p) => p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
const preToken = input.protocols.filter(isPreToken);
const slugs = new Set(rows.map((r) => r.slug));

assert.ok(rows.length >= 100, `only ${rows.length} rows`);
assert.equal(rows.length, new Set(slugs).size, 'duplicate slugs');
assert.equal(rows.length, preToken.length, 'board does not cover every pre-token protocol');
for (const p of preToken) assert.ok(slugs.has(p.slug), `board misses pre-token ${p.slug}`);
for (const s of input.watchlist) assert.ok(slugs.has(s), `board misses watchlist ${s}`);
for (const r of rows) {
  assert.ok(isPreToken(r), `${r.slug} is not pre-token`);
  assert.equal(r.token_status, 'pre-token');
}

for (const [i, r] of rows.entries()) {
  assert.equal(r.rank, i + 1, `bad rank at row ${i + 1}`);
  assert.ok(Number.isSafeInteger(r.implied_value_usd), `${r.slug}: implied value is not a whole number`);
  assert.ok(r.implied_value_usd > 0, `${r.slug}: implied value is not positive`);
  assert.ok(r.implied_value_usd <= 1e14, `${r.slug}: implied value is above 1e14`);
  if (i > 0) {
    assert.ok(r.implied_value_usd < rows[i - 1].implied_value_usd, `${r.slug}: implied value does not strictly decrease at row ${i + 1}`);
  }
  assert.ok(Number.isFinite(r.confidence) && r.confidence >= 0 && r.confidence <= 1, `${r.slug}: bad confidence`);
  assert.ok(typeof r.signal === 'string' && r.signal.length > 0, `${r.slug}: missing signal`);
  assert.ok(r.farm_steps.length >= 3 && r.farm_steps.length <= 12, `${r.slug}: bad farm step count`);
  for (const step of r.farm_steps) {
    assert.ok(typeof step === 'string' && step.length >= 20 && step.length <= 600, `${r.slug}: bad farm step length`);
    assert.match(step, /\$[\d,]+/, `${r.slug}: farm step has no dollar amount`);
    assert.match(step, /Cost:/, `${r.slug}: farm step has no cost`);
    assert.match(step, /Time:\s*\d+\s*(minute|hour|day|week)/, `${r.slug}: farm step has no timeframe`);
  }
}
assert.notEqual(rows[0].implied_value_usd, rows.at(-1).implied_value_usd, 'all implied values are equal');

const script = readFileSync(dataPath, 'utf8');
assert.ok(script.startsWith('window.RADAR=') && script.trimEnd().endsWith(';'), 'data.js does not assign window.RADAR');
const radar = JSON.parse(script.slice('window.RADAR='.length).trimEnd().slice(0, -1));
assert.equal(radar.model_version, 'radar-2');
assert.equal(radar.board_size, rows.length);
assert.equal(radar.watchlist_size, input.watchlist.length);
assert.ok(radar.model_formula.length > 20 && radar.model_notes.length > 20, 'model constants are not stated');
assert.ok(radar.model.base_multiple > 0 && radar.model.growth_weight > 0);
assert.ok(radar.model.category_weights.restaking > radar.model.category_weights.default);
assert.equal(radar.rows.length, rows.length);
for (const [i, row] of radar.rows.entries()) {
  assert.equal(row.slug, rows[i].slug);
  assert.equal(row.implied_value_usd, rows[i].implied_value_usd);
  assert.equal(row.confidence, rows[i].confidence);
  assert.equal(row.signal, rows[i].signal);
  assert.equal(row.farm_steps.length, rows[i].farm_steps.length);
}

console.log(`check: ${rows.length} pre-token rows, ${input.watchlist.length}/${input.watchlist.length} watchlist covered, ranks 1..${rows.length}, strictly decreasing implied values ${rows[0].implied_value_usd}..${rows.at(-1).implied_value_usd}, signal per row, farm plans present`);
