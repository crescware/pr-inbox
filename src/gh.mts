import { spawnSync } from "node:child_process";

import { clean } from "./clean.mts";

export const gh = <T,>(args: string[]): T => {
  const result = spawnSync("gh", args, {
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    env: { ...process.env, GH_PROMPT_DISABLED: "1" },
  });
  if (result.error || result.status !== 0) {
    throw new Error(
      clean(result.error?.message || result.stderr).slice(0, 400),
    );
  }
  const value: T & { errors?: { message: string }[] } = JSON.parse(
    result.stdout,
  );
  if (value.errors?.length) {
    throw new Error(
      value.errors.map((e: { message: string }) => e.message).join("; "),
    );
  }
  return value;
};
