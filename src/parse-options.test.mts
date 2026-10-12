import { expect, test } from "vitest";

import { parseOptions } from "./parse-options.mts";

test("GitHub ユーザー名だけを受け取る", () => {
  expect(parseOptions(["author"])).toEqual({ author: "author" });
});
test("--repo と --trunk を、値を続けても = でつないでも受け取る", () => {
  const expected = { author: "author", repo: "org/repo", trunk: "main" };
  expect(parseOptions(["--repo", "org/repo", "--trunk", "main", "author"])).toEqual(expected);
  expect(parseOptions(["author", "--repo=org/repo", "--trunk=main"])).toEqual(expected);
});
test("ユーザー名を一つ必須とし、未知のオプション・不正な名前やリポジトリは拒否する", () => {
  for (const args of [
    [],
    ["--ack"],
    ["--ack", "1"],
    ["author", "contributor"],
    ["bad/name"],
    ["-author"],
    ["--repo"],
    ["--repo", "author"],
    ["--repo", "invalid", "author"],
    ["--repo", "a/b/c", "author"],
    ["--trunk", "", "author"],
  ]) {
    expect(() => parseOptions(args)).toThrow(
      "Usage: pr-inbox [--repo OWNER/REPO] [--trunk BRANCH] <GitHub username>",
    );
  }
});
