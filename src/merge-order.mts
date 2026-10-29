import { parentOf } from "./parent-of.mts";
import type { PR } from "./types.mts";

export const mergeOrder = (
  all: PR[],
  author: string,
  trunk: string,
  select: (pr: PR) => boolean = () => true,
): PR[] => {
  const user = author.toLowerCase();
  const selected = all
    .filter(
      (p) =>
        p.author.login.toLowerCase() === user ||
        p.reviewRequests.some((r) => r.login?.toLowerCase() === user) ||
        p.reviewedBy?.toLowerCase() === user ||
        p.detail?.reviews.nodes.some(
          (r) => r.state !== "PENDING" && r.author?.login.toLowerCase() === user,
        ),
    )
    .filter(select);
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
