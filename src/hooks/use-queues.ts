import { useEffect, useEffectEvent, useState } from "react";

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

const fetchQueues = async (scope: string, sections: Section[]) => {
  const custom = sections.map((s) => searchPRs(sectionQuery(s, scope)));
  if (scope) {
    const [open, merged, closed, ...rest] = await Promise.all([
      listRepoPRs(scope),
      listRepoPRs(scope, "MERGED"),
      listRepoPRs(scope, "CLOSED"),
      ...custom,
    ]);
    return {
      all: open ?? [],
      closed: closed ?? [],
      merged: merged ?? [],
      ...Object.fromEntries(rest.map((list, i) => [`section-${i}`, list])),
    };
  }
  const lists = await Promise.all([
    ...GLOBAL_QUEUES.map((q) => searchPRs(GLOBAL_QUERIES[q.id] ?? "")),
    ...custom,
  ]);
  return Object.fromEntries([
    ...GLOBAL_QUEUES.map((q, i) => [q.id, lists[i] ?? []]),
    ...sections.map((_, i) => [
      `section-${i}`,
      lists[GLOBAL_QUEUES.length + i] ?? [],
    ]),
  ]) as Record<string, PR[]>;
};

export const useQueues = (
  scope: string,
  me: string,
  flash: Flash,
  sections: Section[]
) => {
  const [data, setData] = useState<Record<string, PR[]> | null>(null);
  const [busy, setBusy] = useState(true);

  const fetchAll = async () => {
    try {
      setData(await fetchQueues(scope, sections));
    } catch (error) {
      flash(`✗ ${errorMessage(error)}`, C.red);
      setData((d) => d ?? {});
    }
    setBusy(false);
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

  let lists: Record<string, PR[]> | null = data;
  if (scope && data) {
    const all = data.all ?? [];
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
