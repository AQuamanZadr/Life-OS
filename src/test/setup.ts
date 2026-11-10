import "fake-indexeddb/auto";
import { afterEach, beforeEach } from "vitest";
import { LifeOsDb, setDb } from "@/core/db/db";

let counter = 0;
let current: LifeOsDb | null = null;

// Каждый тест получает чистую базу.
beforeEach(async () => {
  current = new LifeOsDb(`test-${process.pid}-${counter++}`);
  await current.open();
  setDb(current);
});

afterEach(async () => {
  if (current) {
    current.close();
    await LifeOsDb.delete(current.name);
  }
  setDb(null);
});
