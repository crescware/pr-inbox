import { expect, test } from "vitest";

import { facts } from "./facts.mts";
import { empty, pr, review } from "./fixtures.mts";

test.each([
  ["SUCCESS", "success"],
  ["FAILURE", "failure"],
  ["ERROR", "failure"],
  ["PENDING", "pending"],
  ["EXPECTED", "pending"],
  ["UNRECOGNIZED", "unknown"],
])("最新コミットのチェック集計 %s を %s と判定する", (state, expected) => {
  const p = pr();
  p.detail.headCommit = { nodes: [{ commit: { statusCheckRollup: { state } } }] };
  expect(facts(p).checks).toBe(expected);
});
test("チェックなしと取得不明を区別する", () => {
  const p = pr();
  p.detail.headCommit = { nodes: [{ commit: { statusCheckRollup: null } }] };
  expect(facts(p).checks).toBe("none");
  p.detail.headCommit = { nodes: [] };
  expect(facts(p).checks).toBe("unknown");
  expect(facts({ ...p, detail: undefined }).checks).toBe("unknown");
});
test("チェックはコミット日時やマージコミットの除外に影響されない", () => {
  const p = pr();
  p.detail.commits = empty([
    { commit: { committedDate: "2026-10-09T12:00:00Z", parents: { totalCount: 1 } } },
    { commit: { committedDate: "2026-10-09T08:00:00Z", parents: { totalCount: 2 } } },
  ]);
  p.detail.headCommit = {
    nodes: [{ commit: { statusCheckRollup: { state: "FAILURE" } } }],
  };
  expect(facts(p).checks).toBe("failure");
  expect(facts(p).commitAt).toBe("2026-10-09T12:00:00Z");
});

test("Bot と PR 作者の Approve は集計しない", () => {
  const p = pr();
  p.detail.reviews.nodes = [
    review("APPROVED", "", undefined, "review-bot", "Bot"),
    review("APPROVED", "", undefined, "author"),
  ];
  expect(facts(p).approved).toBe(false);
});
test("コンフリクトあり・なし・計算中・取得不明を区別する", () => {
  const p = pr();
  for (const [state, expected] of [
    ["MERGEABLE", false],
    ["CONFLICTING", true],
    ["UNKNOWN", null],
  ] as const) {
    p.detail.mergeable = state;
    expect(facts(p).conflict).toBe(expected);
  }
  expect(facts({ ...p, detail: undefined }).conflict).toBeNull();
});
test("コメントは Approve を取り消さず、変更要求と承認の取り消しは反映する", () => {
  const p = pr();
  p.detail.reviews.nodes = [
    review("APPROVED"),
    review("COMMENTED", "補足", "2026-10-09T09:30:00Z"),
  ];
  expect(facts(p).approved).toBe(true);
  for (const state of ["DISMISSED", "CHANGES_REQUESTED"]) {
    p.detail.reviews.nodes[1] = review(state, "", "2026-10-09T09:30:00Z");
    expect(facts(p).approved).toBe(false);
  }
});
test("レビュー依頼先とレビューした人を併記し、どちらもなければハイフンを表示する", () => {
  const p = pr();
  expect(facts(p).reviewers).toEqual([]);
  p.detail.reviews.nodes = [review("COMMENTED")];
  expect(facts(p).reviewers).toEqual(["reviewer"]);
  p.reviewRequests = [{ login: "reviewer-b" }, { login: "reviewer-a" }];
  expect(facts(p).reviewers).toEqual(["reviewer", "reviewer-a", "reviewer-b"]);
});
test("レビュー依頼がコメントや承認に変わっても Reviewer から消さない", () => {
  const p = pr();
  p.reviewRequests = [{ login: "reviewer-b" }, { login: "reviewer-a" }];
  expect(facts(p).reviewers).toEqual(["reviewer-a", "reviewer-b"]);
  p.reviewRequests = [{ login: "reviewer-b" }];
  p.detail.reviews.nodes = [review("COMMENTED", "指摘", undefined, "reviewer-a")];
  expect(facts(p).reviewers).toEqual(["reviewer-a", "reviewer-b"]);
  p.detail.reviews.nodes.push(review("APPROVED", "", undefined, "Reviewer-A"));
  expect(facts(p).reviewers).toEqual(["Reviewer-A", "reviewer-b"]);
});
test("レビューした作者・Bot・下書きの投稿者は Reviewer に加えない", () => {
  const p = pr();
  p.detail.reviews.nodes = [
    review("APPROVED", "", undefined, "author"),
    review("COMMENTED", "指摘", undefined, "review-bot", "Bot"),
    review("PENDING", "下書き", undefined, "reviewer"),
  ];
  expect(facts(p).reviewers).toEqual([]);
});
test("Reviewer を大文字小文字に関係なくアルファベット順に表示する", () => {
  const p = pr();
  p.reviewRequests = [
    { login: "Zulu" },
    { slug: "team-a" },
    { login: "alpha" },
    { name: "review-group" },
    { login: "Beta" },
  ];
  expect(facts(p).reviewers).toEqual(["alpha", "Beta", "review-group", "team-a", "Zulu"]);
  expect(p.reviewRequests[0]?.login).toBe("Zulu");
});
test("最新コメントより後のコミットを検出する", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  expect(facts(p).after).toBe("あり");
  expect(facts(p).commentAt).toBe("2026-10-09T09:00:00Z");
});
test("レビュー本文・スレッド内コメント・一般コメントの件数を合計する", () => {
  const p = pr();
  p.detail.reviews.nodes = [
    review("COMMENTED", "Please adjust the naming"),
    review("APPROVED"),
    review("COMMENTED", " \n\t"),
  ];
  const comment = {
    author: { login: "reviewer", __typename: "User" },
    createdAt: "2026-10-09T09:00:00Z",
    state: "SUBMITTED",
  };
  p.detail.comments.nodes = [comment, comment];
  p.detail.reviewThreads.nodes = [{ comments: empty([comment, comment]) }];
  expect(facts(p).commentCount).toBe(5);
  p.detail.commits.pageInfo.hasPreviousPage = true;
  expect(facts(p).commentCount).toBe(5);
});
test.each([
  { login: "author", __typename: "User" },
  { login: "AUTHOR", __typename: "User" },
  { login: "review-bot", __typename: "Bot" },
  null,
])("作者・Bot・不明な投稿者のコメントを数えない: %j", (author) => {
  const p = pr();
  p.detail.reviews.nodes = [{ ...review("COMMENTED", "Please adjust the naming"), author }];
  const comment = { author, createdAt: "2026-10-09T09:00:00Z" };
  p.detail.comments.nodes = [comment];
  p.detail.reviewThreads.nodes = [{ comments: empty([comment]) }];
  expect(facts(p).commentCount).toBe(0);
});
test("未投稿のレビューとスレッド内コメントを数えない", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("PENDING", "Please adjust the naming")];
  p.detail.reviewThreads.nodes = [
    {
      comments: empty([
        {
          author: { login: "reviewer", __typename: "User" },
          createdAt: "2026-10-09T09:00:00Z",
          state: "PENDING",
        },
      ]),
    },
  ];
  expect(facts(p).commentCount).toBe(0);
});
test("コメントなしの0件と詳細未取得の件数不明を区別する", () => {
  expect(facts(pr()).commentCount).toBe(0);
  expect(facts({ ...pr(), detail: undefined }).commentCount).toBeNull();
});
test.each(["reviews", "comments", "reviewThreads", "threadComments"] as const)(
  "%s の取得が不完全ならコメント件数を不明にする",
  (connection) => {
    const p = pr();
    p.detail.reviews.nodes = [review("COMMENTED", "Please adjust the naming")];
    const comment = {
      author: { login: "reviewer", __typename: "User" },
      createdAt: "2026-10-09T09:00:00Z",
    };
    const comments = empty([comment]);
    p.detail.comments.nodes = [comment];
    p.detail.reviewThreads.nodes = [{ comments }];
    if (connection === "threadComments") {
      comments.pageInfo.hasPreviousPage = true;
    } else if (connection === "reviewThreads") {
      p.detail.reviewThreads.pageInfo.hasNextPage = true;
    } else {
      p.detail[connection].pageInfo.hasPreviousPage = true;
    }
    expect(facts(p).commentCount).toBeNull();
  },
);
test("レビュー本文より新しいスレッド返信を最新コメントとして扱う", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  p.detail.reviewThreads.nodes = [
    {
      comments: empty([
        {
          author: { login: "reviewer", __typename: "User" },
          createdAt: "2026-10-09T11:00:00Z",
          state: "SUBMITTED",
        },
      ]),
    },
  ];
  expect(facts(p).after).toBe("なし");
});
test("コメントを下書きした時刻ではなく公開した時刻で比較する", () => {
  const p = pr();
  p.detail.reviewThreads.nodes = [
    {
      comments: empty([
        {
          author: { login: "reviewer", __typename: "User" },
          createdAt: "2026-10-09T08:00:00Z",
          state: "SUBMITTED",
          pullRequestReview: { submittedAt: "2026-10-09T11:00:00Z" },
        },
      ]),
    },
  ];
  expect(facts(p).after).toBe("なし");
});
test("PR 作者の返信・Bot のコメント・未公開の下書きは比較対象に含めない", () => {
  const p = pr();
  p.detail.comments.nodes = [
    {
      author: { login: "author", __typename: "User" },
      createdAt: "2026-10-09T12:00:00Z",
    },
    {
      author: { login: "review-bot", __typename: "Bot" },
      createdAt: "2026-10-09T12:00:00Z",
    },
  ];
  p.detail.reviewThreads.nodes = [
    {
      comments: empty([
        {
          author: { login: "reviewer", __typename: "User" },
          createdAt: "2026-10-09T12:00:00Z",
          state: "PENDING",
        },
      ]),
    },
  ];
  expect(facts(p).after).toBe("コメントなし");
});
test("HEAD の日時が古くてもコメント後のコミットが他にあれば検出する", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  p.detail.commits.nodes.push({
    commit: {
      committedDate: "2026-10-09T08:00:00Z",
      parents: { totalCount: 1 },
    },
  });
  expect(facts(p).after).toBe("あり");
});
test("コメントとコミットが同時刻ならコメント後とは扱わない", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘", "2026-10-09T10:00:00Z")];
  expect(facts(p).after).toBe("なし");
});
test("コメント後にマージコミットだけが増えてもチェックしない", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  p.detail.commits.nodes[0].commit.committedDate = "2026-10-09T08:00:00Z";
  for (const totalCount of [2, 3]) {
    p.detail.commits.nodes.push({
      commit: {
        committedDate: "2026-10-09T11:00:00Z",
        parents: { totalCount },
      },
    });
  }
  expect(facts(p).after).toBe("なし");
  expect(facts(p).commitAt).toBe("2026-10-09T08:00:00Z");
});
test("親がゼロまたは一つのコミットは比較対象に含める", () => {
  for (const totalCount of [0, 1]) {
    const p = pr();
    p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
    p.detail.commits.nodes[0].commit.parents.totalCount = totalCount;
    expect(facts(p).after).toBe("あり");
  }
});
test("取得範囲内がすべてマージコミットで履歴に続きがあれば不明とする", () => {
  const p = pr();
  p.detail.reviews.nodes = [review("COMMENTED", "指摘")];
  p.detail.commits.nodes[0].commit.parents.totalCount = 2;
  expect(facts(p).after).toBe("なし");
  expect(facts(p).commitAt).toBeNull();
  p.detail.commits.pageInfo.hasPreviousPage = true;
  expect(facts(p).after).toBe("不明");
});
test("未取得または取得範囲が不完全な情報を断定しない", () => {
  const p = pr();
  p.detail.reviews.pageInfo.hasPreviousPage = true;
  expect(facts(p).approved).toBeNull();
  expect(facts(p).after).toBe("不明");
  expect(facts({ ...p, detail: undefined }).reviewers).toBeNull();
});
