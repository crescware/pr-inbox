import { parseArgs } from "node:util";

const USAGE = "Usage: pr-inbox [--repo OWNER/REPO] [--trunk BRANCH] <GitHub username>";

const parse = (args: string[]) => {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      options: { repo: { type: "string" }, trunk: { type: "string" } },
    });
  } catch {
    throw new Error(USAGE);
  }
};

export const parseOptions = (args: string[]): { author: string; repo?: string; trunk?: string } => {
  const { values, positionals } = parse(args);
  const [author] = positionals;
  if (
    positionals.length !== 1 ||
    !author ||
    !/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i.test(author) ||
    (values.repo !== undefined && !/^[a-z\d-]+\/[\w.-]+$/i.test(values.repo)) ||
    values.trunk === ""
  ) {
    throw new Error(USAGE);
  }
  return { author, repo: values.repo, trunk: values.trunk };
};
