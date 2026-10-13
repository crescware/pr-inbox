import { expect, test } from "vitest";

import { withStdoutTTY } from "./fixtures.mts";
import { githubAccount } from "./github-account.mts";

test("端末でなければラベルだけを表示する", () => {
  expect(withStdoutTTY(false, () => githubAccount("reviewer-name", "revie"))).toBe("revie");
});
test("端末ではラベルをGitHubアカウントへのリンクにする", () => {
  expect(withStdoutTTY(true, () => githubAccount("reviewer-name", "revie"))).toBe(
    "\u001B]8;;https://github.com/reviewer-name\u001B\\revie\u001B]8;;\u001B\\",
  );
});
