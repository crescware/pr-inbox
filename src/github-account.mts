import { clean } from "./clean.mts";

export const githubAccount = (login: string, label = login): string => {
  const safeLogin = clean(login);
  const safeLabel = clean(label);
  return process.stdout.isTTY
    ? "\u001B]8;;https://github.com/" +
        encodeURIComponent(safeLogin) +
        "\u001B\\" +
        safeLabel +
        "\u001B]8;;\u001B\\"
    : safeLabel;
};
