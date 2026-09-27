import type { CheckState } from "../github/checks.ts";
import type { PR } from "../github/prs.ts";
import { C } from "../theme.ts";

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86_400;
const MONTH = DAY * 30;

export const age = (iso: string | null) => {
  if (!iso) {
    return "";
  }
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < HOUR) {
    return `${Math.max(1, Math.floor(s / MINUTE))}m`;
  }
  if (s < DAY) {
    return `${Math.floor(s / HOUR)}h`;
  }
  if (s < MONTH) {
    return `${Math.floor(s / DAY)}d`;
  }
  return `${Math.floor(s / MONTH)}mo`;
};

// how long something ran, like "1m 04s"
export const duration = (start: string | null, end: string | null) => {
  if (!start) {
    return "";
  }
  const s = Math.max(
    0,
    Math.round(
      ((end ? new Date(end) : new Date()).getTime() -
        new Date(start).getTime()) /
        1000
    )
  );
  if (s < 60) {
    return `${s}s`;
  }
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
};

// cut to n columns with a trailing ellipsis
export const fit = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, Math.max(0, n - 1))}…` : s;

export const pad = (s: string, n: number) => fit(s, n).padEnd(n);

export const plural = (n: number, word: string) =>
  `${n} ${n === 1 ? word : `${word}s`}`;

export interface Status {
  color: string;
  icon: string;
  label: string;
}

export const checksStatus = (checks: PR["checks"]): Status => {
  switch (checks) {
    case "pass": {
      return { color: C.green, icon: "●", label: "Checks passing" };
    }
    case "fail": {
      return { color: C.red, icon: "●", label: "Checks failing" };
    }
    case "pending": {
      return { color: C.yellow, icon: "◌", label: "Checks running" };
    }
    default: {
      return { color: C.faint, icon: "·", label: "No checks" };
    }
  }
};

export const checkIcon = (state: CheckState): Status => {
  switch (state) {
    case "pass": {
      return { color: C.green, icon: "✓", label: "passed" };
    }
    case "fail": {
      return { color: C.red, icon: "✗", label: "failed" };
    }
    case "running": {
      return { color: C.yellow, icon: "◌", label: "running" };
    }
    case "queued": {
      return { color: C.faint, icon: "○", label: "queued" };
    }
    default: {
      return { color: C.faint, icon: "–", label: state };
    }
  }
};

export const reviewStatus = (pr: PR): Status & { short: string } => {
  if (pr.mergeable === "CONFLICTING") {
    return {
      color: C.red,
      icon: "⚠",
      label: "Merge conflicts",
      short: "conflict",
    };
  }
  if (pr.isDraft) {
    return { color: C.dim, icon: "◇", label: "Draft", short: "draft" };
  }
  switch (pr.reviewDecision) {
    case "APPROVED": {
      return {
        color: C.green,
        icon: "✓",
        label: "Approved",
        short: "approved",
      };
    }
    case "CHANGES_REQUESTED": {
      return {
        color: C.red,
        icon: "±",
        label: "Changes requested",
        short: "changes",
      };
    }
    case "REVIEW_REQUIRED": {
      return {
        color: C.yellow,
        icon: "○",
        label: "Review required",
        short: "review",
      };
    }
    default: {
      return {
        color: C.dim,
        icon: "○",
        label: "No review required",
        short: "",
      };
    }
  }
};

// colors are read when called, so they follow theme changes
export const reviewState = (state: string): Status => {
  switch (state) {
    case "APPROVED": {
      return { color: C.green, icon: "✓", label: "approved" };
    }
    case "CHANGES_REQUESTED": {
      return { color: C.red, icon: "±", label: "requested changes" };
    }
    case "COMMENTED": {
      return { color: C.dim, icon: "›", label: "commented" };
    }
    default: {
      return { color: C.faint, icon: "–", label: state.toLowerCase() };
    }
  }
};

// readable text on a GitHub label's background color
export const labelText = (hex: string) => {
  const n = Number.parseInt(hex.slice(0, 6).padEnd(6, "0"), 16);
  const [r, g, b] = [(n / 65_536) % 256, (n / 256) % 256, n % 256].map(
    Math.floor
  );
  const luma = 0.299 * (r ?? 0) + 0.587 * (g ?? 0) + 0.114 * (b ?? 0);
  return luma > 150 ? "#111111" : "#ffffff";
};

export interface MarkdownLine {
  // position in the description, for React keys
  id: number;
  text: string;
  color: string;
  bold: boolean;
}

// PR descriptions, lightly rendered: headings, bullets, and code blocks read as such; HTML,
// comments and image tags (mostly bot badges) are dropped, and inline markup is unwrapped
export const renderMarkdown = (body: string): MarkdownLine[] => {
  const cleaned = (body ?? "")
    .replaceAll("\r", "")
    .replaceAll(/<!--[\s\S]*?-->/gu, "")
    .replaceAll(/<[^>]+>/gu, "")
    .replaceAll("\t", "  ")
    .replaceAll(/\n{3,}/gu, "\n\n")
    .trim();
  if (!cleaned) {
    return [{ bold: false, color: C.faint, id: 0, text: "No description." }];
  }
  let inCode = false;
  const lines = cleaned
    .split("\n")
    .flatMap((raw): Omit<MarkdownLine, "id">[] => {
      if (raw.trimStart().startsWith("```")) {
        inCode = !inCode;
        return [];
      }
      if (inCode) {
        return [{ bold: false, color: C.cyan, text: `  ${raw}` }];
      }
      const inline = raw
        .replaceAll(/!\[[^\]]*\]\([^)]*\)/gu, "")
        .replaceAll(/\[(?<text>[^\]]+)\]\([^)]*\)/gu, "$<text>")
        .replaceAll(/\*\*(?<text>[^*]+)\*\*/gu, "$<text>")
        .replaceAll(/__(?<text>[^_]+)__/gu, "$<text>");
      const heading = /^(?<hashes>#{1,6})\s+(?<text>.*)$/u.exec(inline);
      if (heading) {
        return [
          {
            bold: true,
            color: heading.groups?.hashes === "#" ? C.accent : C.text,
            text: heading.groups?.text ?? "",
          },
        ];
      }
      const bullet = /^(?<indent>\s*)[-*+]\s+(?<text>.*)$/u.exec(inline);
      if (bullet) {
        return [
          {
            bold: false,
            color: C.dim,
            text: `${bullet.groups?.indent ?? ""}• ${bullet.groups?.text ?? ""}`,
          },
        ];
      }
      if (/^\s*[-*_]{3,}\s*$/u.test(inline)) {
        return [];
      }
      return [{ bold: false, color: C.dim, text: inline }];
    });
  return lines.map((line, id) => ({ ...line, id }));
};
