import { useEffect, useState } from "react";

import { behindBy } from "../github/prs.ts";
import type { PR } from "../github/prs.ts";
import { prKey } from "../stacks.ts";

const branchKey = (pr: PR) => `${prKey(pr)}:${pr.headRefName}`;

export const useBehind = (pr: PR | undefined) => {
  const [cache, setCache] = useState<Record<string, number>>({});
  const key = pr ? branchKey(pr) : "";

  useEffect(() => {
    if (!pr || key in cache) {
      return;
    }
    let live = true;
    const load = async () => {
      let n: number;
      try {
        n = await behindBy(pr);
      } catch {
        // -1 means unknown; the sidebar hides the line
        n = -1;
      }
      if (live) {
        setCache((c) => ({ ...c, [key]: n }));
      }
    };
    load();
    return () => {
      live = false;
    };
  }, [pr, key, cache]);

  const markUpToDate = (p: PR) =>
    setCache((c) => ({ ...c, [branchKey(p)]: 0 }));

  return { behind: pr ? cache[key] : undefined, markUpToDate };
};
