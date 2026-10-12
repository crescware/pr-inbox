#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { parseArgs, styleText } from "node:util";

const USAGE =
  "Usage: node index.mts [--repo OWNER/REPO] [--trunk BRANCH] <GitHub username>";

export type Target = { repo: string; trunk: string };
type Actor = { login: string; __typename: string } | null;
type Connection<T> = {
  nodes: T[];
  pageInfo: { hasNextPage?: boolean; hasPreviousPage?: boolean };
};
type Comment = {
  author: Actor;
  createdAt: string;
  state?: string;
  pullRequestReview?: { submittedAt: string | null } | null;
};
type Review = {
  author: Actor;
  state: string;
  submittedAt: string | null;
  body: string;
};
export type Detail = {
  state: string;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  baseRefName: string;
  headRefName: string;
  reviews: Connection<Review>;
  reviewThreads: Connection<{ comments: Connection<Comment> }>;
  comments: Connection<Comment>;
  commits: Connection<{
    commit: { committedDate: string; parents: { totalCount: number } };
  }>;
};
export type PR = {
  number: number;
  title: string;
  author: { login: string };
  baseRefName: string;
  headRefName: string;
  isCrossRepository?: boolean;
  reviewRequests: { login?: string; slug?: string; name?: string }[];
  detail?: Detail;
};
export type Facts = {
  approved: boolean | null;
  conflict: boolean | null;
  approval: string;
  reviewers: string[] | null;
  commentAt: string | null;
  commitAt: string | null;
  after: string;
};

export const clean = (value: unknown): string => {
  return String(value ?? "")
    .replaceAll(/[\r\n\t]+/g, " ")
    .replaceAll(/[\p{Cc}\p{Cf}]/gu, "")
    .replaceAll(/\s+/g, " ")
    .trim();
};

const human = (actor: Actor, author: string): actor is NonNullable<Actor> => {
  return Boolean(
    actor &&
    actor.__typename === "User" &&
    actor.login.toLowerCase() !== author.toLowerCase(),
  );
};

const latest = (values: (string | null | undefined)[]): string | null => {
  const valid = values.filter((v): v is string =>
    Boolean(v && Number.isFinite(Date.parse(v))),
  );
  return valid.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
};

const reviewerNames = (names: string[]): string[] => {
  return [
    ...new Map(names.map((name) => [name.toLowerCase(), name])).values(),
  ].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
};

export const facts = (pr: PR): Facts => {
  const requested = pr.reviewRequests.map(
    (r) => r.login || r.slug || r.name || "?",
  );
  const detail = pr.detail;
  if (!detail) {
    return {
      approved: null,
      conflict: null,
      approval: "不明",
      reviewers: requested.length ? reviewerNames(requested) : null,
      commentAt: null,
      commitAt: null,
      after: "不明",
    };
  }
  const reviews = detail.reviews.nodes.filter(
    (r) => human(r.author, pr.author.login) && r.state !== "PENDING",
  );
  const opinions = new Map<string, string>();
  for (const r of [...reviews].sort(
    (a, b) => Date.parse(a.submittedAt || "") - Date.parse(b.submittedAt || ""),
  )) {
    if (
      r.author &&
      ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state)
    ) {
      opinions.set(r.author.login, r.state);
    }
  }
  const truncatedReviews = Boolean(detail.reviews.pageInfo.hasPreviousPage);
  const changes = [...opinions.values()].includes("CHANGES_REQUESTED");
  const approved = truncatedReviews
    ? null
    : !changes && [...opinions.values()].includes("APPROVED");
  const threads = detail.reviewThreads.nodes;
  const comments = [
    ...detail.comments.nodes
      .filter((c) => human(c.author, pr.author.login))
      .map((c) => c.createdAt),
    ...reviews.filter((r) => r.body.trim()).map((r) => r.submittedAt),
    ...threads.flatMap((t) =>
      t.comments.nodes
        .filter(
          (c) => human(c.author, pr.author.login) && c.state !== "PENDING",
        )
        .map((c) => latest([c.createdAt, c.pullRequestReview?.submittedAt])),
    ),
  ];
  const commentsIncomplete =
    truncatedReviews ||
    detail.comments.pageInfo.hasPreviousPage ||
    detail.reviewThreads.pageInfo.hasNextPage ||
    threads.some((t) => t.comments.pageInfo.hasPreviousPage);
  const commentAt = latest(comments);
  const commitAt = latest(
    detail.commits.nodes
      .filter((c) => c.commit.parents.totalCount <= 1)
      .map((c) => c.commit.committedDate),
  );
  const after = commentsIncomplete
    ? "不明"
    : !commentAt
      ? "コメントなし"
      : commitAt && Date.parse(commitAt) > Date.parse(commentAt)
        ? "あり"
        : detail.commits.pageInfo.hasPreviousPage
          ? "不明"
          : "なし";
  return {
    approved,
    conflict:
      detail.mergeable === "UNKNOWN"
        ? null
        : detail.mergeable === "CONFLICTING",
    approval:
      approved === null
        ? "不明"
        : changes
          ? "変更要求"
          : approved
            ? "あり"
            : "なし",
    reviewers: reviewerNames([
      ...requested,
      ...reviews.flatMap((r) => (r.author ? [r.author.login] : [])),
    ]),
    commentAt: commentsIncomplete ? null : commentAt,
    commitAt,
    after,
  };
};

const parentOf = (all: PR[], pr: PR, trunk: string): PR | undefined => {
  if (pr.baseRefName === trunk) {
    return undefined;
  }
  const matches = all.filter(
    (p) => !p.isCrossRepository && p.headRefName === pr.baseRefName,
  );
  if (matches.length > 1) {
    throw new Error("Ambiguous parent PR: #" + pr.number);
  }
  return matches[0];
};

export const mergeOrder = (
  all: PR[],
  author: string,
  trunk: string,
): PR[] => {
  const selected = all.filter(
    (p) => p.author.login.toLowerCase() === author.toLowerCase(),
  );
  const included = new Map<number, PR>();
  const parents = new Map<number, PR>();
  const include = (pr: PR, visiting = new Set<number>()): void => {
    if (visiting.has(pr.number)) {
      throw new Error("Stack cycle: #" + pr.number);
    }
    if (included.has(pr.number)) {
      return;
    }
    visiting.add(pr.number);
    const parent = parentOf(all, pr, trunk);
    if (parent) {
      parents.set(pr.number, parent);
      include(parent, visiting);
    }
    visiting.delete(pr.number);
    included.set(pr.number, pr);
  };
  selected.forEach((p) => include(p));
  const result: PR[] = [];
  const visit = (pr: PR): void => {
    result.push(pr);
    [...included.values()]
      .filter((p) => parents.get(p.number)?.number === pr.number)
      .sort((a, b) => a.number - b.number)
      .forEach(visit);
  };
  [...included.values()]
    .filter((p) => !parents.has(p.number))
    .sort((a, b) => a.number - b.number)
    .forEach(visit);
  return result;
};

const gh = <T,>(args: string[]): T => {
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

const fetchPRs = (
  target: Target,
  author: string,
): { prs: PR[]; warnings: string[] } => {
  console.error("Fetching open PRs...");
  const all = gh<PR[]>([
    "pr",
    "list",
    "--repo",
    target.repo,
    "--state",
    "open",
    "--limit",
    "500",
    "--json",
    "number,title,author,baseRefName,headRefName,isCrossRepository,reviewRequests",
  ]);
  if (all.length === 500) {
    throw new Error("Cannot determine merge order with 500 or more open PRs");
  }
  const ordered = mergeOrder(all, author, target.trunk);
  const [owner, name] = target.repo.split("/");
  const warnings: string[] = [];
  for (let i = 0; i < ordered.length; i += 5) {
    const batch = ordered.slice(i, i + 5);
    console.error(
      "Fetching details: " + batch.map((p) => "#" + p.number).join(", "),
    );
    const fields = batch
      .map(
        (p) =>
          "p" +
          p.number +
          ":pullRequest(number:" +
          p.number +
          ") {" +
          "state baseRefName headRefName mergeable " +
          "reviews(last:100){pageInfo{hasPreviousPage} nodes{author{login __typename}state submittedAt body}} " +
          "reviewThreads(first:100){pageInfo{hasNextPage} nodes{comments(last:50){pageInfo{hasPreviousPage} nodes{author{login __typename}createdAt state pullRequestReview{submittedAt}}}}} " +
          "comments(last:100){pageInfo{hasPreviousPage}nodes{author{login __typename}createdAt}} " +
          "commits(last:100){pageInfo{hasPreviousPage}nodes{commit{committedDate parents{totalCount}}}} " +
          "}",
      )
      .join("\n");
    try {
      const response = gh<{
        data: { repository: Record<string, Detail | null> };
      }>([
        "api",
        "graphql",
        "-f",
        "owner=" + owner,
        "-f",
        "name=" + name,
        "-f",
        "query=query($owner:String!,$name:String!){repository(owner:$owner,name:$name){" +
          fields +
          "}}",
      ]);
      for (const pr of batch) {
        const detail = response.data.repository["p" + pr.number];
        if (!detail) {
          throw new Error("Missing details for #" + pr.number);
        }
        pr.detail = detail;
        pr.baseRefName = detail.baseRefName;
        pr.headRefName = detail.headRefName;
      }
    } catch (error) {
      warnings.push(
        "Failed to fetch #" +
          batch.map((p) => p.number).join(", #") +
          ": " +
          clean(error instanceof Error ? error.message : error),
      );
    }
  }
  return {
    prs: all.filter((p) => !p.detail || p.detail.state === "OPEN"),
    warnings,
  };
};

const width = (text: string): number => {
  return [...text].reduce(
    (n, ch) =>
      n +
      (/\p{Mark}/u.test(ch)
        ? 0
        : /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}\p{Extended_Pictographic}\u3000-\u30FF\uFF01-\uFF60]/u.test(
              ch,
            )
          ? 2
          : 1),
    0,
  );
};

const styled = (
  format: Parameters<typeof styleText>[0],
  text: string,
): string => {
  return process.stdout.isTTY ? styleText(format, text) : text;
};

const cell = (
  value: unknown,
  size: number,
  align: "left" | "right" = "left",
  color?: "green" | "red",
): string => {
  const text = clean(value);
  const padding = " ".repeat(Math.max(0, size - width(text)));
  const padded = align === "right" ? padding + text : text + padding;
  const style =
    color ??
    (text === "✓"
      ? "green"
      : text === "-"
        ? "dim"
        : text === "?"
          ? "yellow"
          : "none");
  return styled(style, padded);
};

const indicator = (
  value: boolean | null,
  size: number,
  color: "green" | "red" = "green",
): string => {
  return cell(
    value === null ? "?" : value ? "✓" : "-",
    size,
    "right",
    value === true ? color : undefined,
  );
};

const prNumber = (repo: string, number: number, size = 0): string => {
  const label = "#" + number;
  const padded = cell(label, size);
  return process.stdout.isTTY
    ? "\u001B]8;;https://github.com/" +
        repo +
        "/pull/" +
        number +
        "\u001B\\" +
        label +
        "\u001B]8;;\u001B\\" +
        padded.slice(label.length)
    : padded;
};

export const relativeTime = (value: string | null, now: number): string => {
  if (!value) {
    return "-";
  }
  const elapsed = now - Date.parse(value);
  if (!Number.isFinite(elapsed)) {
    return "?";
  }
  const minutes = Math.floor(Math.abs(elapsed) / 60_000);
  const sign = elapsed < 0 && minutes > 0 ? "-" : "";
  if (minutes < 60) {
    return sign + minutes + "m";
  }
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? sign + hours + "h" : sign + Math.floor(hours / 24) + "d";
};

export const render = (
  all: PR[],
  author: string,
  target: Target,
  warnings: string[] = [],
  now = Date.now(),
): string => {
  const ordered = mergeOrder(all, author, target.trunk);
  const selectedAuthor = author.toLowerCase();
  const title = (pr: PR): string =>
    (pr.author.login.toLowerCase() !== selectedAuthor ? "[parent] " : "") +
    clean(pr.title);
  const roots = new Map<string, PR[]>();
  const children = new Map<number, PR[]>();
  for (const pr of ordered) {
    const parent = parentOf(ordered, pr, target.trunk);
    if (parent) {
      const siblings = children.get(parent.number) ?? [];
      siblings.push(pr);
      children.set(parent.number, siblings);
    } else {
      const siblings = roots.get(pr.baseRefName) ?? [];
      siblings.push(pr);
      roots.set(pr.baseRefName, siblings);
    }
  }
  const displayOrder: PR[] = [];
  const lines = [target.repo + " / " + author, "", styled("bold", "Stack"), ""];
  const draw = (siblings: PR[], prefix: string): void => {
    siblings.forEach((pr, index) => {
      const last = index === siblings.length - 1;
      lines.push(
        prefix +
          (last ? "└─ " : "├─ ") +
          prNumber(target.repo, pr.number) +
          " " +
          styled("dim", title(pr)),
      );
      displayOrder.push(pr);
      draw(children.get(pr.number) ?? [], prefix + (last ? "   " : "│  "));
    });
  };
  for (const [base, siblings] of roots) {
    lines.push(clean(base));
    draw(siblings, "");
  }
  if (!ordered.length) {
    lines.push("No open PRs");
  }
  lines.push("", styled("bold", "PRs"));
  const titleWidth = Math.max(
    width("Title"),
    ...displayOrder.map((pr) => width(title(pr))),
  );
  const trunkWidth = width(clean(target.trunk));
  lines.push(
    "",
    styled(
      ["bold", "dim"],
      [
        cell("PR", 7),
        cell("Title", titleWidth),
        cell(target.trunk, trunkWidth),
        cell("Conflict", 8),
        cell("Approved", 8),
        cell("Fixed", 5),
        cell("Commit", 6, "right"),
        cell("Comment", 7, "right"),
        "Reviewer",
      ].join(" "),
    ),
  );
  const abbreviations = new Map<string, string[]>();
  const reviewers = (names: string[] | null): string => {
    if (names === null) {
      return "Unknown";
    }
    if (names.length < 2) {
      return names.join("") || "-";
    }
    return names
      .map((name) => {
        const short = [...name].slice(0, 5).join("");
        if (short !== name) {
          abbreviations.set(
            short,
            reviewerNames([...(abbreviations.get(short) ?? []), name]),
          );
        }
        return short;
      })
      .join(", ");
  };
  displayOrder.forEach((pr) => {
    const f = facts(pr);
    const highlight =
      pr.baseRefName === target.trunk &&
      f.approved === true &&
      f.conflict === false
        ? "greenBright"
        : "none";
    lines.push(
      [
        styled(highlight, prNumber(target.repo, pr.number, 7)),
        styled(highlight, cell(title(pr), titleWidth)),
        indicator(pr.baseRefName === target.trunk, trunkWidth),
        indicator(f.conflict, 8, "red"),
        indicator(f.approved, 8),
        indicator(f.after === "不明" ? null : f.after === "あり", 5),
        cell(relativeTime(f.commitAt, now), 6, "right"),
        cell(relativeTime(f.commentAt, now), 7, "right"),
        cell(reviewers(f.reviewers), 0),
      ].join(" "),
    );
  });
  lines.push("");
  if (abbreviations.size) {
    lines.push(styled("bold", "Reviewers"), "");
    for (const short of reviewerNames([...abbreviations.keys()])) {
      lines.push(
        cell(short, 5) + "  " + (abbreviations.get(short) ?? []).join(", "),
      );
    }
    lines.push("");
  }
  warnings.forEach((w) => lines.push("Warning: " + clean(w)));
  return lines.join("\n");
};

const parseOptions = (args: string[]) => {
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

const resolveTarget = (repo?: string, trunk?: string): Target => {
  if (repo && trunk) {
    return { repo, trunk };
  }
  let view: {
    nameWithOwner: string;
    defaultBranchRef: { name: string } | null;
  };
  try {
    view = gh([
      "repo",
      "view",
      ...(repo ? [repo] : []),
      "--json",
      "nameWithOwner,defaultBranchRef",
    ]);
  } catch (error) {
    if (repo) {
      throw error;
    }
    throw new Error(
      "Cannot determine the repository of the current directory; use --repo OWNER/REPO: " +
        clean(error instanceof Error ? error.message : error),
    );
  }
  const branch = trunk ?? view.defaultBranchRef?.name;
  if (!branch) {
    throw new Error(
      "Cannot determine the default branch of " +
        view.nameWithOwner +
        "; use --trunk BRANCH",
    );
  }
  return { repo: view.nameWithOwner, trunk: branch };
};

export const main = (args: string[]): void => {
  const { values, positionals } = parseOptions(args);
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
  const target = resolveTarget(values.repo, values.trunk);
  const { prs, warnings } = fetchPRs(target, author);
  console.log(render(prs, author, target, warnings));
};

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(
      "pr-inbox: " + clean(error instanceof Error ? error.message : error),
    );
    process.exitCode = 1;
  }
}
