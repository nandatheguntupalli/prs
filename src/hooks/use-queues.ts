import { useEffect, useEffectEvent, useRef, useState } from "react";

import { saveCache } from "../cache.ts";
import type { ListCache } from "../cache.ts";
import { errorMessage } from "../github/client.ts";
import { listRepoPRs, searchPRs } from "../github/prs.ts";
import type { PR } from "../github/prs.ts";
import { C } from "../theme.ts";
import type { Flash } from "../theme.ts";

export interface Queue {
  id: string;
  label: string;
}

export interface Section {
  title: string;
  filter: string;
}

const GLOBAL_QUERIES: Record<string, string> = {
  closed: "is:pr is:closed is:unmerged author:@me archived:false",
  involved: "is:open is:pr involves:@me archived:false",
  merged: "is:pr is:merged author:@me archived:false",
  mine: "is:open is:pr author:@me archived:false",
  review: "is:open is:pr review-requested:@me archived:false",
};

const REPO_QUEUES: Queue[] = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "review", label: "Review requested" },
  { id: "merged", label: "Merged" },
  { id: "closed", label: "Closed" },
];

const GLOBAL_QUEUES: Queue[] = [
  { id: "mine", label: "Mine" },
  { id: "review", label: "Review requested" },
  { id: "involved", label: "Involved" },
  { id: "merged", label: "Merged" },
  { id: "closed", label: "Closed" },
];

const sectionQuery = (section: Section, scope: string) => {
  const parts = [section.filter];
  if (!/\bis:pr\b/u.test(section.filter)) {
    parts.push("is:pr");
  }
  if (scope && !/\brepo:/u.test(section.filter)) {
    parts.push(`repo:${scope}`);
  }
  return parts.join(" ");
};

interface Job {
  id: string;
  // names the query for the cache
  key: string;
  load: () => Promise<PR[]>;
}

// Each list is fetched on its own, so the tab you land on doesn't wait for the others.
const queueJobs = (scope: string, sections: Section[]): Job[] => {
  const custom = sections.map((s, i): Job => {
    const query = sectionQuery(s, scope);
    return { id: `section-${i}`, key: query, load: () => searchPRs(query) };
  });
  if (scope) {
    return [
      { id: "all", key: "open", load: () => listRepoPRs(scope) },
      { id: "merged", key: "merged", load: () => listRepoPRs(scope, "MERGED") },
      { id: "closed", key: "closed", load: () => listRepoPRs(scope, "CLOSED") },
      ...custom,
    ];
  }
  return [
    ...GLOBAL_QUEUES.map((q): Job => {
      const query = GLOBAL_QUERIES[q.id] ?? "";
      return { id: q.id, key: query, load: () => searchPRs(query) };
    }),
    ...custom,
  ];
};

export const useQueues = (
  scope: string,
  me: string,
  flash: Flash,
  sections: Section[],
  cached: ListCache
) => {
  // start from the last session's lists; the spinner shows until they're replaced
  const [data, setData] = useState<Record<string, PR[]>>(() =>
    Object.fromEntries(
      queueJobs(scope, sections).flatMap((job) => {
        const list = cached[job.key];
        return list ? [[job.id, list]] : [];
      })
    )
  );
  const [busy, setBusy] = useState(true);
  // a refresh started later wins over one still in flight
  const generation = useRef(0);
  const saved = useRef(cached);

  const fetchAll = async () => {
    generation.current += 1;
    const { current } = generation;
    const jobs = queueJobs(scope, sections);
    const fresh: ListCache = {};
    await Promise.all(
      jobs.map(async ({ id, key, load }) => {
        try {
          const list = await load();
          fresh[key] = list;
          if (generation.current === current) {
            setData((d) => ({ ...d, [id]: list }));
          }
        } catch (error) {
          if (generation.current === current) {
            flash(`✗ ${errorMessage(error)}`, C.red);
            // keep what was there, but don't leave the tab loading forever
            setData((d) => ({ ...d, [id]: d[id] ?? [] }));
          }
        }
      })
    );
    if (generation.current === current) {
      setBusy(false);
      // lists that failed keep their last good copy; dropped sections fall out
      saved.current = Object.fromEntries(
        jobs.flatMap(({ key }) => {
          const list = fresh[key] ?? saved.current[key];
          return list ? [[key, list]] : [];
        })
      );
      saveCache(scope, saved.current);
    }
  };

  const refresh = () => {
    setBusy(true);
    fetchAll();
  };

  const loadOnce = useEffectEvent(fetchAll);
  useEffect(() => {
    const go = async () => {
      await loadOnce();
    };
    go();
  }, []);

  let lists: Record<string, PR[]> = data;
  if (scope && data.all) {
    const { all } = data;
    lists = {
      ...data,
      mine: all.filter((p) => p.author === me),
      review: all.filter((p) => p.reviewRequests.includes(me)),
    };
  }
  const queues = [
    ...(scope ? REPO_QUEUES : GLOBAL_QUEUES),
    ...sections.map((s, i) => ({ id: `section-${i}`, label: s.title })),
  ];
  return { busy, lists, queues, refresh };
};
