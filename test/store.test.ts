import assert from 'node:assert/strict';
import test from 'node:test';
import { allNumbers, Store, versioned, type KeyValueStore } from '../src/core/Store.ts';

/** A platform store that behaves, and one that does not. */
class Memory implements KeyValueStore {
  readonly data = new Map<string, string>();
  readonly writes: string[] = [];
  async getItem(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string): Promise<void> {
    this.writes.push(key);
    this.data.set(key, value);
  }
}

class Broken implements KeyValueStore {
  async getItem(): Promise<string | null> {
    throw new Error('no store');
  }
  async setItem(): Promise<void> {
    throw new Error('no store');
  }
}

test('a store that throws reads as a player who has never played, and swallows a failed write', async () => {
  const store = new Store(new Broken());
  assert.equal(await store.read('best'), null);
  assert.equal(await store.readNumber('best'), 0);
  assert.equal(await store.readJson('game', () => ({})), null);
  store.write('best', '7');
  await store.flushed(); // does not reject
});

test('numbers come back whole, and anything that is not a number reads as the fallback', async () => {
  const memory = new Memory();
  const store = new Store(memory);
  store.keepNumber('best', 12.7);
  await store.flushed();
  assert.equal(await store.readNumber('best'), 12);

  memory.data.set('best', 'rubbish');
  assert.equal(await store.readNumber('best', 3), 3);
  memory.data.set('best', '-4');
  assert.equal(await store.readNumber('best', 3), 3);
});

test('a prefix keeps two games on one domain apart', async () => {
  const memory = new Memory();
  const store = new Store(memory, 'tower.');
  store.keepNumber('best', 5);
  await store.flushed();
  assert.deepEqual([...memory.data.keys()], ['tower.best']);
});

test('writes to one key land in the order they were made', async () => {
  const memory = new Memory();
  const store = new Store(memory);
  for (let i = 1; i <= 5; i++) store.keepNumber('best', i);
  await store.flushed();
  assert.equal(memory.data.get('best'), '5');
  assert.equal(memory.writes.length, 5);
});

test('a save of another version is passed over rather than half-read', async () => {
  const memory = new Memory();
  const store = new Store(memory);
  const accept = versioned<{ v: number; score: number }>(2, (save) => allNumbers(save, ['score']));

  memory.data.set('game', JSON.stringify({ v: 2, score: 9 }));
  assert.deepEqual(await store.readJson('game', accept), { v: 2, score: 9 });

  memory.data.set('game', JSON.stringify({ v: 1, score: 9 }));
  assert.equal(await store.readJson('game', accept), null);

  memory.data.set('game', JSON.stringify({ v: 2 }));
  assert.equal(await store.readJson('game', accept), null);

  memory.data.set('game', '{ not json');
  assert.equal(await store.readJson('game', accept), null);

  memory.data.set('game', 'null');
  assert.equal(await store.readJson('game', accept), null);
});

test('a cleared key reads as nothing', async () => {
  const memory = new Memory();
  const store = new Store(memory);
  store.keepJson('game', { v: 1, score: 3 });
  store.clear('game');
  await store.flushed();
  assert.equal(await store.readJson('game', () => ({})), null);
});
