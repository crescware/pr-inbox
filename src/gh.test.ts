import { spawnSync } from "node:child_process";
import { beforeEach, expect, test, vi } from "vitest";

import { gh } from "./gh.mts";

vi.mock("node:child_process", () => ({ spawnSync: vi.fn() }));

const respond = (result: {
  status: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
}) => vi.mocked(spawnSync).mockReturnValue(result as never);

beforeEach(() => {
  vi.mocked(spawnSync).mockReset();
});

test("gh を対話プロンプトなしで実行し、標準出力の JSON を返す", () => {
  respond({ status: 0, stdout: '{"value":1}' });
  expect(gh(["api", "user"])).toEqual({ value: 1 });
  expect(spawnSync).toHaveBeenCalledWith(
    "gh",
    ["api", "user"],
    expect.objectContaining({
      env: expect.objectContaining({ GH_PROMPT_DISABLED: "1" }),
    }),
  );
});
test("終了コードが 0 以外なら標準エラー出力を整えて 400 文字までのエラーにする", () => {
  respond({ status: 1, stdout: "", stderr: "first\nsecond\u001B" });
  expect(() => gh(["api", "user"])).toThrow(/^first second$/);
  respond({ status: 1, stdout: "", stderr: "x".repeat(500) });
  expect(() => gh(["api", "user"])).toThrow(/^x{400}$/);
});
test("gh を起動できなければその理由をエラーにする", () => {
  respond({ status: null, error: new Error("spawnSync gh ENOENT") });
  expect(() => gh(["api", "user"])).toThrow("spawnSync gh ENOENT");
});
test("GraphQL のエラーが返ればメッセージをまとめてエラーにする", () => {
  respond({
    status: 0,
    stdout: JSON.stringify({ errors: [{ message: "a" }, { message: "b" }] }),
  });
  expect(() => gh(["api", "graphql"])).toThrow("a; b");
});
