import { expect, test } from "vitest";

import { sleep } from "./sleep.mts";

test("指定したミリ秒のあいだ処理を止める", () => {
  const start = performance.now();
  sleep(50);
  expect(performance.now() - start).toBeGreaterThanOrEqual(45);
});
