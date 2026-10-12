import { expect, test } from "vitest";

import { inTerminal, withStdoutTTY } from "./fixtures.mts";
import { styled } from "./styled.mts";

const module = new URL("./styled.mts", import.meta.url);

test("端末でなければ装飾せずにそのまま返す", () => {
  expect(withStdoutTTY(false, () => styled("green", "text"))).toBe("text");
});
test("端末では指定した書式で装飾する", () => {
  expect(inTerminal(module, 'm.styled("green", "text")')).toBe(
    "\u001B[32mtext\u001B[39m",
  );
  expect(inTerminal(module, 'm.styled("none", "text")')).toBe("text");
});
