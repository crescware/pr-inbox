#!/usr/bin/env node
import { realpathSync } from "node:fs";

import { clean } from "./src/clean.mts";
import { fetchPRs } from "./src/fetch-prs.mts";
import { parseOptions } from "./src/parse-options.mts";
import { render } from "./src/render.mts";
import { resolveTarget } from "./src/resolve-target.mts";

export const main = (args: string[]): void => {
  const { author, repo, trunk } = parseOptions(args);
  const target = resolveTarget(repo, trunk);
  const { prs, warnings } = fetchPRs(target, author);
  console.log(render(prs, author, target, warnings));
};

if (process.argv[1] && realpathSync(process.argv[1]) === import.meta.filename) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error("pr-inbox: " + clean(error instanceof Error ? error.message : error));
    process.exitCode = 1;
  }
}
