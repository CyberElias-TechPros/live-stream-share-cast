import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { unlink, writeFile } from 'node:fs/promises';

const output = await build({
  entryPoints: [new URL('../src/lib/payments.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
});
const modulePath = join(tmpdir(), `lsc-payments-${randomUUID()}.mjs`);
await writeFile(modulePath, output.outputFiles[0].text);
const { settleTip } = await import(pathToFileURL(modulePath).href);

class FakeDb {
  constructor() {
    this.tip = { status: 'pending', paid_at: null, amount_cents: 1250 };
    this.daily = new Map();
  }

  prepare(sql) {
    return {
      bind: (...values) => ({
        run: async () => {
          if (sql.includes('UPDATE tips')) {
            const [status, , , , paidAt, , previous] = values;
            if (this.tip.status !== previous) return { meta: { changes: 0 } };
            this.tip.status = status;
            if (status === 'paid') this.tip.paid_at ??= paidAt;
            return { meta: { changes: 1 } };
          }
          if (sql.includes('INSERT INTO analytics_daily')) {
            const [, userId, day, initial, , delta] = values;
            const key = `${userId}:${day}`;
            this.daily.set(key, this.daily.has(key) ? Math.max(0, this.daily.get(key) + delta) : Math.max(0, initial));
            return { meta: { changes: 1 } };
          }
          throw new Error(`Unexpected SQL in test: ${sql}`);
        },
        first: async () => {
          if (sql.includes('SELECT paid_at FROM tips')) return { paid_at: this.tip.paid_at };
          throw new Error(`Unexpected SQL in test: ${sql}`);
        },
      }),
    };
  }
}

const input = {
  tipId: 'tip-test',
  streamerId: 'creator-test',
  streamId: null,
  amountCents: 1250,
  currency: 'usd',
  message: null,
  tipperName: null,
  provider: 'test',
  providerRef: 'payment-test',
};

const db = new FakeDb();
const [first, racingDuplicate] = await Promise.all([
  settleTip({ DB: db }, { ...input, status: 'paid' }),
  settleTip({ DB: db }, { ...input, status: 'paid' }),
]);
assert.equal(Number(first) + Number(racingDuplicate), 1, 'only one concurrent paid callback should transition the tip');
assert.equal([...db.daily.values()].reduce((sum, value) => sum + value, 0), 1250, 'paid analytics should be counted once');
assert.equal(await settleTip({ DB: db }, { ...input, status: 'paid' }), false, 'a repeated paid callback should be a no-op');
assert.equal([...db.daily.values()].reduce((sum, value) => sum + value, 0), 1250, 'replays must not inflate analytics');
assert.equal(await settleTip({ DB: db }, { ...input, status: 'refunded' }), true, 'paid tips can be refunded once');
assert.equal([...db.daily.values()].reduce((sum, value) => sum + value, 0), 0, 'refund should reverse the original day rollup');
assert.equal(await settleTip({ DB: db }, { ...input, status: 'refunded' }), false, 'a repeated refund should be a no-op');

const failedDb = new FakeDb();
assert.equal(await settleTip({ DB: failedDb }, { ...input, status: 'failed' }), true);
assert.equal(await settleTip({ DB: failedDb }, { ...input, status: 'paid' }), false, 'failed tips cannot later be marked paid from a replay');
assert.equal(failedDb.daily.size, 0, 'failed tips must not affect earnings analytics');
await unlink(modulePath);

console.log('payment state transitions: passed (replay, concurrency, refund, failed intent)');
