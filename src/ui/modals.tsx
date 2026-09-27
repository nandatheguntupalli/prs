import type { KeyEvent } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";

import { errorMessage } from "../github/client.ts";
import { repoLabels } from "../github/prs.ts";
import type { Label, PR, ReviewEvent } from "../github/prs.ts";
import { C, THEME_CHOICES } from "../theme.ts";
import type { ThemeChoice } from "../theme.ts";
import { fit, plural } from "./format.ts";
import { keyId } from "./keys.ts";
import { BOLD, KeyHint, Modal, PickList, fuzzy } from "./primitives.tsx";
import type { ListItem } from "./primitives.tsx";

// up / down (and ctrl+n / ctrl+p) move through a list of `count` items
const useListNav = (count: number) => {
  const [cursor, setCursor] = useState(0);
  const move = (id: string) => {
    if (id === "down" || id === "ctrl+n" || id === "tab") {
      setCursor((c) => Math.min(c + 1, Math.max(0, count - 1)));
      return true;
    }
    if (id === "up" || id === "ctrl+p" || id === "shift+tab") {
      setCursor((c) => Math.max(c - 1, 0));
      return true;
    }
    return false;
  };
  return { cursor: Math.min(cursor, Math.max(0, count - 1)), move, setCursor };
};

const Search = ({
  value,
  placeholder,
  onInput,
}: {
  value: string;
  placeholder: string;
  onInput: (v: string) => void;
}) => (
  <box flexDirection="row" height={1} marginBottom={1}>
    <text fg={C.accent}>› </text>
    <input
      focused
      value={value}
      placeholder={placeholder}
      flexGrow={1}
      textColor={C.text}
      placeholderColor={C.faint}
      backgroundColor={C.panel}
      focusedBackgroundColor={C.panel}
      onInput={onInput}
    />
  </box>
);

export interface Command {
  id: string;
  label: string;
  keys: string;
  run: () => unknown;
}

export const CommandPalette = ({
  commands,
  onClose,
}: {
  commands: Command[];
  onClose: () => void;
}) => {
  const [query, setQuery] = useState("");
  const shown = commands.filter((c) => fuzzy(query, c.label));
  const { cursor, move } = useListNav(shown.length);
  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (id === "escape") {
      onClose();
    } else if (id === "return") {
      const pick = shown[cursor];
      onClose();
      pick?.run();
    } else {
      move(id);
    }
  });
  return (
    <Modal
      title="Command palette"
      width={64}
      footer="↑↓ choose · ⏎ run · esc close"
    >
      <Search value={query} placeholder="type a command…" onInput={setQuery} />
      <PickList
        items={shown.map((c) => ({ hint: c.keys, key: c.id, label: c.label }))}
        cursor={cursor}
        height={14}
        width={60}
      />
    </Modal>
  );
};

export interface HelpSection {
  title: string;
  keys: { keys: string; label: string }[];
}

// sections spread over columns so the tallest column is as short as it can be
const toColumns = (sections: HelpSection[], count: number) => {
  const columns: HelpSection[][] = Array.from({ length: count }, () => []);
  const heights = Array.from({ length: count }, () => 0);
  for (const section of sections.toSorted(
    (a, b) => b.keys.length - a.keys.length
  )) {
    const shortest = heights.indexOf(Math.min(...heights));
    columns[shortest]?.push(section);
    heights[shortest] = (heights[shortest] ?? 0) + section.keys.length + 2;
  }
  return columns;
};

export const HelpModal = ({
  sections,
  onClose,
}: {
  sections: HelpSection[];
  onClose: () => void;
}) => {
  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (id === "escape" || id === "?" || id === "q") {
      onClose();
    }
  });
  return (
    <Modal
      title="Keys"
      width={118}
      footer="esc close · ctrl+p finds any action by name"
    >
      <box flexDirection="row" gap={2}>
        {toColumns(sections, 3).map((column) => (
          <box
            key={column.map((s) => s.title).join(",")}
            flexDirection="column"
            width={37}
          >
            {column.map((s) => (
              <box key={s.title} flexDirection="column" marginBottom={1}>
                <text fg={C.accent} attributes={BOLD}>
                  {s.title}
                </text>
                {s.keys.map((k) => (
                  <KeyHint
                    key={k.keys + k.label}
                    keys={k.keys}
                    label={k.label}
                  />
                ))}
              </box>
            ))}
          </box>
        ))}
      </box>
    </Modal>
  );
};

export const LabelsModal = ({
  pr,
  onApply,
  onClose,
}: {
  pr: PR;
  onApply: (names: string[]) => void;
  onClose: () => void;
}) => {
  const [labels, setLabels] = useState<Label[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [chosen, setChosen] = useState(
    () => new Set(pr.labels.map((l) => l.name))
  );
  const [query, setQuery] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLabels(await repoLabels(pr.repo));
      } catch (error) {
        setLoadError(errorMessage(error));
      }
    };
    load();
  }, [pr.repo]);

  const shown = (labels ?? []).filter((l) => fuzzy(query, l.name));
  const { cursor, move } = useListNav(shown.length);
  const changed =
    chosen.size !== pr.labels.length ||
    pr.labels.some((l) => !chosen.has(l.name));

  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (id === "escape") {
      if (changed) {
        onApply([...chosen]);
      }
      onClose();
    } else if (id === "return") {
      const pick = shown[cursor];
      if (pick) {
        setChosen((set) => {
          const next = new Set(set);
          if (next.has(pick.name)) {
            next.delete(pick.name);
          } else {
            next.add(pick.name);
          }
          return next;
        });
      }
    } else {
      move(id);
    }
  });

  const items: ListItem[] = shown.map((l) => ({
    color: chosen.has(l.name) ? C.text : C.dim,
    key: l.name,
    label: l.name,
    mark: chosen.has(l.name) ? "■" : "□",
    markColor: `#${l.color}`,
  }));
  return (
    <Modal
      title={`Labels · #${pr.number}`}
      width={56}
      footer={`⏎ toggle · esc ${changed ? "save" : "close"} · ${plural(chosen.size, "label")} set`}
    >
      <Search value={query} placeholder="filter labels…" onInput={setQuery} />
      {loadError ? <text fg={C.red}>{loadError}</text> : null}
      {labels ? (
        <PickList items={items} cursor={cursor} height={12} width={52} />
      ) : (
        <text fg={C.dim}>Loading labels…</text>
      )}
    </Modal>
  );
};

const REVIEW_CHOICES: {
  event: ReviewEvent;
  label: string;
  color: () => string;
}[] = [
  { color: () => C.dim, event: "COMMENT", label: "Comment" },
  { color: () => C.green, event: "APPROVE", label: "Approve" },
  { color: () => C.red, event: "REQUEST_CHANGES", label: "Request changes" },
];

export const ReviewModal = ({
  pr,
  onSubmit,
  onClose,
}: {
  pr: PR;
  onSubmit: (event: ReviewEvent, body: string) => void;
  onClose: () => void;
}) => {
  const [step, setStep] = useState<"choose" | "write">("choose");
  const [body, setBody] = useState("");
  const { cursor, move } = useListNav(REVIEW_CHOICES.length);
  const choice = REVIEW_CHOICES[cursor] ?? REVIEW_CHOICES[0];

  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (step === "choose") {
      if (id === "escape") {
        onClose();
      } else if (id === "return") {
        setStep("write");
      } else if (!move(id) && (id === "j" || id === "k")) {
        move(id === "j" ? "down" : "up");
      }
      return;
    }
    if (id === "escape") {
      setStep("choose");
    } else if (id === "return" && choice) {
      // GitHub needs a message for comments and change requests
      if (choice.event !== "APPROVE" && !body.trim()) {
        return;
      }
      onClose();
      onSubmit(choice.event, body.trim());
    }
  });

  return (
    <Modal
      title={`Review #${pr.number}`}
      width={64}
      footer={
        step === "choose"
          ? "↑↓ choose · ⏎ next · esc cancel"
          : `⏎ submit · esc back${choice?.event === "APPROVE" ? " · message optional" : ""}`
      }
    >
      <text fg={C.dim} marginBottom={1} wrapMode="none">
        {fit(pr.title, 60)}
      </text>
      {REVIEW_CHOICES.map((c, i) => (
        <text key={c.event} wrapMode="none">
          <span fg={C.accent}>{i === cursor ? "› " : "  "}</span>
          <span
            fg={i === cursor ? c.color() : C.faint}
            attributes={i === cursor ? BOLD : 0}
          >
            {c.label}
          </span>
        </text>
      ))}
      {step === "write" ? (
        <box marginTop={1} flexDirection="column">
          <Search
            value={body}
            placeholder="leave a message…"
            onInput={setBody}
          />
        </box>
      ) : null}
    </Modal>
  );
};

export const ThemeModal = ({
  current,
  onPreview,
  onChoose,
  onClose,
}: {
  current: ThemeChoice;
  onPreview: (choice: ThemeChoice) => void;
  onChoose: (choice: ThemeChoice) => void;
  onClose: () => void;
}) => {
  const start = Math.max(
    0,
    THEME_CHOICES.findIndex((t) => t.id === current)
  );
  const [cursor, setCursor] = useState(start);
  const pick = (i: number) => {
    const next = Math.max(0, Math.min(i, THEME_CHOICES.length - 1));
    setCursor(next);
    const theme = THEME_CHOICES[next];
    if (theme) {
      onPreview(theme.id);
    }
  };
  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (id === "escape") {
      onPreview(current);
      onClose();
    } else if (id === "return") {
      const theme = THEME_CHOICES[cursor];
      onClose();
      if (theme) {
        onChoose(theme.id);
      }
    } else if (id === "down" || id === "j") {
      pick(cursor + 1);
    } else if (id === "up" || id === "k") {
      pick(cursor - 1);
    }
  });
  return (
    <Modal title="Theme" width={56} footer="↑↓ preview · ⏎ keep · esc cancel">
      <PickList
        items={THEME_CHOICES.map((t) => ({
          key: t.id,
          label: t.label,
          mark: t.id === current ? "●" : " ",
        }))}
        cursor={cursor}
        height={THEME_CHOICES.length}
        width={52}
      />
    </Modal>
  );
};

export interface CopyChoice {
  label: string;
  value: string;
}

export const copyChoices = (pr: PR): CopyChoice[] => [
  { label: "URL", value: pr.url },
  { label: "Markdown link", value: `[${pr.title} (#${pr.number})](${pr.url})` },
  { label: "Number", value: `#${pr.number}` },
  { label: "Title", value: pr.title },
  { label: "Branch", value: pr.headRefName },
  {
    label: "Checkout command",
    value: `gh pr checkout ${pr.number} -R ${pr.repo}`,
  },
];

export const CopyModal = ({
  pr,
  onCopy,
  onClose,
}: {
  pr: PR;
  onCopy: (choice: CopyChoice) => void;
  onClose: () => void;
}) => {
  const choices = copyChoices(pr);
  const { cursor, move } = useListNav(choices.length);
  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (id === "escape") {
      onClose();
    } else if (id === "return") {
      const choice = choices[cursor];
      onClose();
      if (choice) {
        onCopy(choice);
      }
    } else if (!move(id) && (id === "j" || id === "k")) {
      move(id === "j" ? "down" : "up");
    }
  });
  return (
    <Modal
      title={`Copy · #${pr.number}`}
      width={72}
      footer="↑↓ choose · ⏎ copy · esc close"
    >
      <PickList
        items={choices.map((c) => ({
          hint: fit(c.value, 40),
          key: c.label,
          label: c.label,
        }))}
        cursor={cursor}
        height={choices.length}
        width={68}
      />
    </Modal>
  );
};

export const ComposeModal = ({
  title,
  context,
  onSubmit,
  onClose,
}: {
  title: string;
  context: string;
  onSubmit: (body: string) => void;
  onClose: () => void;
}) => {
  const [body, setBody] = useState("");
  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (id === "escape") {
      onClose();
    } else if (id === "return" && body.trim()) {
      onClose();
      onSubmit(body.trim());
    }
  });
  return (
    <Modal title={title} width={72} footer="⏎ post · esc cancel">
      <text fg={C.faint} marginBottom={1} wrapMode="none" truncate>
        {context}
      </text>
      <Search value={body} placeholder="write a comment…" onInput={setBody} />
    </Modal>
  );
};

export const FilesModal = ({
  files,
  onJump,
  onClose,
}: {
  files: { path: string; additions: number; deletions: number }[];
  onJump: (path: string) => void;
  onClose: () => void;
}) => {
  const [query, setQuery] = useState("");
  const shown = files.filter((f) => fuzzy(query, f.path));
  const { cursor, move } = useListNav(shown.length);
  useKeyboard((key: KeyEvent) => {
    const id = keyId(key);
    if (id === "escape") {
      onClose();
    } else if (id === "return") {
      const file = shown[cursor];
      onClose();
      if (file) {
        onJump(file.path);
      }
    } else {
      move(id);
    }
  });
  return (
    <Modal
      title={`Files · ${files.length}`}
      width={80}
      footer="↑↓ choose · ⏎ jump · esc close"
    >
      <Search value={query} placeholder="filter files…" onInput={setQuery} />
      <PickList
        items={shown.map((f) => ({
          hint: `+${f.additions} −${f.deletions}`,
          key: f.path,
          label: f.path,
        }))}
        cursor={cursor}
        height={16}
        width={76}
      />
    </Modal>
  );
};
