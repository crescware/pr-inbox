export const prLink = (repo: string, number: number, label: string): string =>
  process.stdout.isTTY
    ? "\u001B]8;;https://github.com/" +
      repo +
      "/pull/" +
      number +
      "\u001B\\" +
      label +
      "\u001B]8;;\u001B\\"
    : label;
