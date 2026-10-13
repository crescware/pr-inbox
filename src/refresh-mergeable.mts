import { clean } from "./clean.mts";
import { gh } from "./gh.mts";
import { sleep } from "./sleep.mts";
import type { Detail, PR, Target } from "./types.mts";

const ATTEMPTS = 3;
const INTERVAL_MS = 2_000;

/**
 * GitHub はコンフリクトの有無を問い合わせを受けてから計算するため、mergeable が UNKNOWN で返ることがある。
 * UNKNOWN の PR だけ、間隔をあけて mergeable を問い合わせ直す。
 */
export const refreshMergeable = (target: Target, prs: PR[]): string[] => {
  const [owner, name] = target.repo.split("/");
  let pending = prs.filter((p) => p.detail?.mergeable === "UNKNOWN");
  for (let attempt = 0; attempt < ATTEMPTS && pending.length; attempt++) {
    console.error("Waiting for mergeability: " + pending.map((p) => "#" + p.number).join(", "));
    sleep(INTERVAL_MS);
    const fields = pending
      .map((p) => "p" + p.number + ":pullRequest(number:" + p.number + "){mergeable}")
      .join(" ");
    try {
      const response = gh<{
        data: {
          repository: Record<string, { mergeable: Detail["mergeable"] } | null>;
        };
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
      for (const pr of pending) {
        const mergeable = response.data.repository["p" + pr.number]?.mergeable;
        if (mergeable && pr.detail) {
          pr.detail.mergeable = mergeable;
        }
      }
    } catch (error) {
      return [
        "Failed to fetch mergeability of #" +
          pending.map((p) => p.number).join(", #") +
          ": " +
          clean(error instanceof Error ? error.message : error),
      ];
    }
    pending = pending.filter((p) => p.detail?.mergeable === "UNKNOWN");
  }
  return [];
};
