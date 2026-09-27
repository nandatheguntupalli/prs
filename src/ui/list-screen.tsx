import { useState } from "react";

import type { PR } from "../github/prs.ts";
import type { Resizing } from "../hooks/use-pane-sizes.ts";
import { sidebarCells } from "../hooks/use-pane-sizes.ts";
import type { PaneSizes } from "../layout.ts";
import { mergePlan, prKey } from "../stacks.ts";
import type { StackPlace } from "../stacks.ts";
import { C } from "../theme.ts";
import type { Action } from "./keys.ts";
import { PRTable } from "./pr-list.tsx";
import { BOLD, Centered } from "./primitives.tsx";
import { Sidebar } from "./sidebar.tsx";
import type { DetailTab, PRActions } from "./sidebar.tsx";
import type { Status } from "./status.ts";

// Only the grab happens here. The drag is handled at the app root, because the pointer
// leaves a 1-cell-wide line on the first motion event.
const Divider = ({ active, onGrab }: { active: boolean; onGrab: Action }) => {
  const [hot, setHot] = useState(false);
  return (
    <box
      width={1}
      flexShrink={0}
      border={["left"]}
      borderColor={hot || active ? C.accent : C.border}
      onMouseOver={() => setHot(true)}
      onMouseOut={() => setHot(false)}
      onMouseDown={onGrab}
    />
  );
};

const EmptyList = ({
  prs,
  emptyLabel,
  filter,
}: {
  prs: PR[] | null;
  emptyLabel: string;
  filter: string;
}) => {
  if (!prs) {
    return (
      <Centered>
        <text fg={C.dim}>Loading pull requests…</text>
      </Centered>
    );
  }
  return (
    <Centered>
      <text fg={C.green} attributes={BOLD}>
        {filter ? "No matches." : "Inbox zero."}
      </text>
      <text fg={C.dim}>
        {filter
          ? `Nothing in ${emptyLabel} matches “${filter}”.`
          : `Nothing in ${emptyLabel}.`}
      </text>
    </Centered>
  );
};

export interface ListProps {
  prs: PR[] | null;
  list: PR[];
  places: Map<string, StackPlace>;
  statusOf: (pr: PR) => Status;
  pr: PR | undefined;
  cursor: number;
  handleSelectPR: (i: number) => void;
  sidebar: boolean;
  behind: number | undefined;
  actions: PRActions;
  emptyLabel: string;
  filter: string;
  sizes: PaneSizes;
  resizing: Resizing;
  handleGrab: (pane: keyof PaneSizes) => void;
  detailTab: DetailTab;
  handleDetailTab: (tab: DetailTab) => void;
  width: number;
  height: number;
}

export const ListScreen = (p: ListProps) => {
  const paneW = p.width;
  const sideW = sidebarCells(paneW, p.sidebar, p.sizes.sidebar);
  const showSidebar = Boolean(p.pr) && p.sidebar;
  return (
    <box flexGrow={1} flexDirection="row">
      {p.pr ? (
        <PRTable
          list={p.list}
          places={p.places}
          statusOf={p.statusOf}
          cursor={p.cursor}
          focused
          width={paneW - sideW - (p.sidebar ? 1 : 0)}
          height={p.height}
          onSelect={p.handleSelectPR}
        />
      ) : (
        <EmptyList prs={p.prs} emptyLabel={p.emptyLabel} filter={p.filter} />
      )}
      {showSidebar ? (
        <Divider
          active={p.resizing === "sidebar"}
          onGrab={() => p.handleGrab("sidebar")}
        />
      ) : null}
      {showSidebar && p.pr ? (
        <Sidebar
          pr={p.pr}
          status={p.statusOf(p.pr)}
          width={sideW}
          behind={p.behind}
          stack={p.places.get(prKey(p.pr))}
          mergeCount={mergePlan(p.pr, p.places).length}
          tab={p.detailTab}
          onTab={p.handleDetailTab}
          actions={p.actions}
        />
      ) : null}
    </box>
  );
};
