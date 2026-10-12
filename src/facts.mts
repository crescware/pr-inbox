import { latest } from "./latest.mts";
import { reviewerNames } from "./reviewer-names.mts";
import type { Actor, Facts, PR } from "./types.mts";

const human = (actor: Actor, author: string): actor is NonNullable<Actor> => {
  return Boolean(
    actor &&
    actor.__typename === "User" &&
    actor.login.toLowerCase() !== author.toLowerCase(),
  );
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
