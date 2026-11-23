// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every pre-token protocol in the snapshot. A protocol is pre-token when its index
// entry records no token (no market cap, no CoinGecko id, no symbol); the snapshot's live-token
// protocols are kept apart and shown as the market's own values, never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures:
//
//   base        = tvl_usd x BASE_MULTIPLE
//   growth      = 1 + GROWTH_WEIGHT x tanh(clamp(change_7d, FLOOR, CAP) / GROWTH_SCALE)
//   age         = AGE_FLOOR + AGE_GAIN x min(1, age_days / PEAK) x exp(-max(0, age_days - STALE) / DECAY)
//   category    = a generic multiplier from the category's keywords (restaking, points, infra, ...)
//   chains      = 1 + CHAIN_WEIGHT x log2(1 + number of chains)
//   implied     = round(base x growth x age x category x chains)
//
// A missing 7d change is neutral (1.0), an unknown listed_at gets a neutral age multiplier, and each row
// carries a confidence score from how many of the snapshot's fields are present. No protocol name is ever
// special-cased: the same function scores every row.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_scale_pct: number;
  growth_floor: number;
  growth_cap: number;
  age_peak_days: number;
  age_stale_days: number;
  age_decay_days: number;
  age_floor: number;
  age_gain: number;
  unknown_age_days: number;
  unknown_age_multiplier: number;
  chain_weight: number;
  category_weights: Record<string, number>;
  category_keywords: Record<string, string[]>;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.30,
  growth_weight: 0.28,
  growth_scale_pct: 60,
  growth_floor: -80,
  growth_cap: 300,
  age_peak_days: 540,
  age_stale_days: 900,
  age_decay_days: 730,
  age_floor: 0.60,
  age_gain: 0.50,
  unknown_age_days: 365,
  unknown_age_multiplier: 0.85,
  chain_weight: 0.04,
  category_weights: {
    restaking: 1.35,
    points: 1.28,
    infra: 1.20,
    derivatives: 1.12,
    lending: 1.05,
    cex: 0.75,
    default: 1.00,
  },
  category_keywords: {
    restaking: ['restak', 'liquid staking', 'staking pool', 'staking'],
    points: ['curator', 'allocator', 'yield aggregator', 'farm', 'incentive', 'points', 'vault'],
    infra: ['bridge', 'chain', 'canonical', 'rollup', 'oracle', 'infra', 'index'],
    derivatives: ['deriv', 'perpetual', 'option', 'basis'],
    lending: ['lend', 'cdp', 'collateral', 'stable', 'credit'],
    cex: ['cex', 'centralized exchange'],
  },
};

const CATEGORY_PRIORITY = ['restaking', 'points', 'infra', 'derivatives', 'lending', 'cex'];

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** Kept for callers that ask for a cap; the board now carries every pre-token protocol. */
export const EARLY_ROWS = Number.POSITIVE_INFINITY;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  confidence: number;
  signal: string;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_multiplier: number;
    category_multiplier: number;
    category_key: string;
    chain_multiplier: number;
    confidence: number;
    signal: string;
    tie_break: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with the model's own components in the data. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  confidence: number;
  signal: string;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_multiplier: number;
  category_multiplier: number;
  category_key: string;
  chain_multiplier: number;
  tie_break: number;
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  model_formula: string;
  model_notes: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const MAX_IMPLIED = 1e14;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The category bucket: generic keyword groups, never a protocol name. */
function categoryKey(category: string | null, model: ModelConstants): string {
  const c = (category ?? '').toLowerCase();
  for (const key of CATEGORY_PRIORITY) {
    if ((model.category_keywords[key] ?? []).some((word) => c.includes(word))) return key;
  }
  return 'default';
}

/** How much of the snapshot's evidence backs a row, from 0 to 1. */
export function confidenceOf(protocol: SnapshotProtocol, age: number | null): number {
  const presence = protocol.change_7d !== null ? 0.25 : 0;
  const history = age !== null ? 0.20 : 0;
  const category = protocol.category !== null && protocol.category.trim() !== '' ? 0.15 : 0;
  const chains = 0.15 * Math.min(1, Math.max(0, protocol.chains.length) / 3);
  const depth = 0.15 * Math.min(1, Math.log10(Math.max(1, protocol.tvl_usd)) / 10);
  return round3(0.10 + presence + history + category + chains + depth);
}

const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** The multipliers and implied value one protocol gets under `model`. */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants): {
  implied: number;
  growthPct: number;
  growthMult: number;
  maturityMult: number;
  age: number | null;
  categoryMult: number;
  categoryKey: string;
  chainMult: number;
  confidence: number;
  signal: string;
} {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + model.growth_weight * Math.tanh(growthPct / model.growth_scale_pct);
  const ageForModel = age ?? model.unknown_age_days;
  const ramp = Math.min(1, Math.max(0, ageForModel) / model.age_peak_days);
  const decay = Math.exp(-Math.max(0, ageForModel - model.age_stale_days) / model.age_decay_days);
  const maturityMult = age === null ? model.unknown_age_multiplier : model.age_floor + model.age_gain * ramp * decay;
  const key = categoryKey(protocol.category, model);
  const categoryMult = model.category_weights[key] ?? model.category_weights.default ?? 1;
  const chainMult = 1 + model.chain_weight * Math.log2(1 + Math.min(16, Math.max(0, protocol.chains.length)));
  const confidence = confidenceOf(protocol, age);
  const signal = confidence >= 0.85 ? 'high' : confidence >= 0.65 ? 'medium' : 'low';
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * maturityMult * categoryMult * chainMult));
  return { implied, growthPct, growthMult, maturityMult, age, categoryMult, categoryKey: key, chainMult, confidence, signal };
}

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Every pre-token protocol is rankable; the snapshot's own token fields are the only gate. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Every pre-token protocol, strongest first, with ranks 1..n and strictly decreasing implied values. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Set<string>();
  for (const p of snapshot.protocols) if (isRankable(p)) chosen.add(p.slug);
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined && isPreToken(p)) chosen.add(slug);
  }

  const scored = [...chosen].map((slug) => index.get(slug)!).map((p) => ({
    p,
    ...impliedValue(p, snapshot.as_of, model),
  }));
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  let previous = Number.POSITIVE_INFINITY;
  return scored.map((s, i) => {
    const tieBreak = s.implied >= previous ? s.implied - previous + 1 : 0;
    const implied = Math.max(1, Math.min(MAX_IMPLIED, s.implied - tieBreak));
    previous = implied;
    return {
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token' as const,
      age_days: s.age,
      implied_value_usd: implied,
      confidence: s.confidence,
      signal: s.signal,
      model: {
        base_multiple: model.base_multiple,
        growth_pct: s.growthPct,
        growth_multiplier: round4(s.growthMult),
        maturity_multiplier: round4(s.maturityMult),
        age_multiplier: round4(s.maturityMult),
        category_multiplier: round4(s.categoryMult),
        category_key: s.categoryKey,
        chain_multiplier: round4(s.chainMult),
        confidence: s.confidence,
        signal: s.signal,
        tie_break: tieBreak,
        age_days: s.age,
      },
      farm_steps: farmSteps(s.p, s.age).map(stepText),
    };
  });
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/**
 * A protocol's farm plan: eight steps, each an action with a dollar amount, a cost and a timeframe. The
 * plan is derived from the protocol's own record (category, chains, TVL, age), never from a list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Send a $5 test transfer to a fresh wallet, confirm the address on ${chain}, and keep its seed phrase offline before committing any capital.`,
      cost: '$5 of test funds and under $3 of gas',
      time: '10 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '20 minutes to set up',
    },
    {
      text: `Cap the token approval for ${p.name} at $${capital} instead of an unlimited allowance, then verify the contract address on ${chain}.`,
      cost: 'about $2 of gas for the approval',
      time: '10 minutes',
    },
    {
      text: `Make one qualifying action a week with $${Math.max(10, Math.round(capital / 4))} of the position, such as a small deposit, borrow, swap or vote.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the full $${capital} position for at least ${hold} days so the activity lands in more than one weekly snapshot.`,
      cost: `the $${capital} stays locked in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check the pool's TVL and 7d change each week; if TVL falls 20% or more against the $${capital} position, stop adding funds and review.`,
      cost: 'no onchain fee; about $1 of checkup time',
      time: '10 minutes a week',
    },
    {
      text: `Claim rewards only from the link published on ${p.name}'s own rewards page; budget a small claim transaction instead of paying any third party.`,
      cost: 'up to $5 of gas per claim and no claim fee',
      time: '15 minutes',
    },
    {
      text: `Record the wallet, the $${capital} committed, every date and each transaction, then unwind the position in one withdrawal and log the result.`,
      cost: 'about $3 of gas to withdraw and a free log',
      time: '20 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, including the model components and the farm plan. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    confidence: row.confidence,
    signal: row.signal,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    age_multiplier: row.model.age_multiplier,
    category_multiplier: row.model.category_multiplier,
    category_key: row.model.category_key,
    chain_multiplier: row.model.chain_multiplier,
    tie_break: row.model.tie_break,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    model_formula: `implied = round(tvl_usd x ${model.base_multiple} x (1 + ${model.growth_weight} x tanh(clamp(change_7d, ${model.growth_floor}, ${model.growth_cap}) / ${model.growth_scale_pct})) x age x category x chains; age = ${model.age_floor} + ${model.age_gain} x min(1, age_days / ${model.age_peak_days}) x exp(-max(0, age_days - ${model.age_stale_days}) / ${model.age_decay_days}); chains = 1 + ${model.chain_weight} x log2(1 + chain count)`,
    model_notes: `Missing 7d change multiplies by 1.0, unknown listed_at uses ${model.unknown_age_multiplier}, and category keywords map to ${JSON.stringify(model.category_weights)}. Confidence blends the presence of change, age, category, chains and TVL depth into a 0..1 score. Every pre-token protocol is ranked; live-token protocols are set aside with their market caps.`,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, value, signal and steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const preToken = snapshot.protocols.filter(isPreToken);
  const missingPre = preToken.filter((p) => !slugs.has(p.slug));
  if (missingPre.length > 0) return `the board misses ${missingPre.length} pre-token protocol${missingPre.length === 1 ? '' : 's'}: ${missingPre.slice(0, 5).map((p) => p.slug).join(', ')}`;
  for (const r of board) if (!isPreToken(r)) return `${r.slug} has a token on record and cannot be a pre-token row`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  if (board.length < 100) return `the board holds ${board.length} rows, fewer than the 100 required`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd >= board[i - 1]!.implied_value_usd) return `row ${i + 1} does not rank strictly below row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > MAX_IMPLIED) return `${r.slug} has implied value ${r.implied_value_usd}`;
    if (!Number.isFinite(r.confidence) || r.confidence < 0 || r.confidence > 1) return `${r.slug} has confidence ${r.confidence}`;
    if (typeof r.signal !== 'string' || r.signal.length === 0) return `${r.slug} has no signal score`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
