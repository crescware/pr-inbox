export type Target = { repo: string; trunk: string };
export type Actor = { login: string; __typename: string } | null;
export type Connection<T> = {
  nodes: T[];
  pageInfo: { hasNextPage?: boolean; hasPreviousPage?: boolean };
};
export type Comment = {
  author: Actor;
  createdAt: string;
  state?: string;
  pullRequestReview?: { submittedAt: string | null } | null;
};
export type Review = {
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
  headCommit: {
    nodes: { commit: { statusCheckRollup: { state: string } | null } }[];
  };
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
  isDraft: boolean;
  additions: number;
  deletions: number;
  author: { login: string };
  baseRefName: string;
  headRefName: string;
  isCrossRepository?: boolean;
  reviewRequests: { login?: string; slug?: string; name?: string }[];
  /** User whose submitted review was found by the PR search. */
  reviewedBy?: string;
  detail?: Detail;
};
export type Facts = {
  checks: "success" | "failure" | "pending" | "none" | "unknown";
  approved: boolean | null;
  conflict: boolean | null;
  approval: string;
  reviewers: string[] | null;
  commentAt: string | null;
  commitAt: string | null;
  after: string;
};
