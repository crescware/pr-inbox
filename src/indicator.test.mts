import { expect, test } from "vitest";

import { inTerminal, withStdoutTTY } from "./fixtures.mts";
import { indicator } from "./indicator.mts";

const module = new URL("./indicator.mts", import.meta.url);

test("true は ✓、false は -、null は ? を右揃えで表示する", () => {
  withStdoutTTY(false, () => {
    expect(indicator(true, 3)).toBe("  ✓");
    expect(indicator(false, 3)).toBe("  -");
    expect(indicator(null, 3)).toBe("  ?");
  });
});
test("端末では true のときだけ指定した色を使う", () => {
  const output = inTerminal(
    module,
    'JSON.stringify([m.indicator(true, 1), m.indicator(true, 1, "red"), m.indicator(false, 1, "red")])',
  );
  expect(JSON.parse(output)).toEqual([
    "\u001B[32m✓\u001B[39m",
    "\u001B[31m✓\u001B[39m",
    "\u001B[2m-\u001B[22m",
  ]);
});
