import { clean } from "./clean.mts";
import { gh } from "./gh.mts";
import { mergeOrder } from "./merge-order.mts";
import { refreshMergeable } from "./refresh-mergeable.mts";
import type { Detail, PR, Target } from "./types.mts";

export const fetchPRs = (target: Target, author: string): { prs: PR[]; warnings: string[] } => {
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
    "number,title,isDraft,additions,deletions,author,baseRefName,headRefName,isCrossRepository,reviewRequests",
  ]);
  if (all.length === 500) {
    throw new Error("Cannot determine merge order with 500 or more open PRs");
  }
  if (all.length) {
    // Search so selection does not depend on the bounded review history fetched below.
    const reviewed = gh<{ number: number }[]>([
      "pr",
      "list",
      "--repo",
      target.repo,
      "--state",
      "open",
      "--limit",
      "500",
      "--search",
      "reviewed-by:" + author,
      "--json",
      "number",
    ]);
    const numbers = new Set(reviewed.map((p) => p.number));
    for (const pr of all) {
      if (numbers.has(pr.number)) {
        pr.reviewedBy = author;
      }
    }
  }
  const ordered = mergeOrder(all, author, target.trunk);
  const [owner, name] = target.repo.split("/");
  const warnings: string[] = [];
  for (let i = 0; i < ordered.length; i += 5) {
    const batch = ordered.slice(i, i + 5);
    console.error("Fetching details: " + batch.map((p) => "#" + p.number).join(", "));
    const fields = batch
      .map(
        (p) =>
          "p" +
          p.number +
          ":pullRequest(number:" +
          p.number +
          ") {" +
          "state baseRefName headRefName mergeable " +
          "headCommit:commits(last:1){nodes{commit{statusCheckRollup{state}}}} " +
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
  warnings.push(...refreshMergeable(target, ordered));
  return {
    prs: all.filter((p) => !p.detail || p.detail.state === "OPEN"),
    warnings,
  };
};
