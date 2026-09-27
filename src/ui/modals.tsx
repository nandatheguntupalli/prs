import type { KeyEvent, TextareaRenderable } from "@opentui/core";
import { useKeyboard } from "@opentui/react";
import { useEffect, useRef, useState } from "react";

import { errorMessage } from "../github/client.ts";
import { repoLabels } from "../github/prs.ts";
import type { Label, PR, ReviewEvent } from "../github/prs.ts";
import { C, THEME_CHOICES } from "../theme.ts";
import type { ThemeChoice } from "../theme.ts";
import { fit, plural } from "./format.ts";
import { keyId } from "./keys.ts";
import { BOLD, Choices, KeyHint, Modal, fuzzy } from "./primitives.tsx";

// for lists under a search box: the box has focus, so arrows are handled here
const useSearchCursor = (count: number) => {
  const [cursor, setCursor] = useState(0);
  const move = (id: string) => {
    if (id === "down" || id === "ctrl+n") {
      setCursor((c) => Math.min(c + 1, Math.max(0, count - 1)));
    } else if (id === "up" || id === "ctrl+p") {
      setCursor((c) => Math.max(c - 1, 0));
    }
  };
  return { cursor: Math.min(cursor, Math.max(0, count - 1)), move };
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
  const { cursor, move } = useSearchCursor(shown.length);
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
      <Choices
        choices={shown.map((c) => ({ hint: c.keys, name: c.label }))}
        index={cursor}
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

// balance the columns so the tallest one is as short as possible
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
  const { cursor, move } = useSearchCursor(shown.length);
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

  return (
    <Modal
      title={`Labels · #${pr.number}`}
      width={56}
      footer={`⏎ toggle · esc ${changed ? "save" : "close"} · ${plural(chosen.size, "label")} set`}
    >
      <Search value={query} placeholder="filter labels…" onInput={setQuery} />
      {loadError ? <text fg={C.red}>{loadError}</text> : null}
      {labels ? (
        <Choices
          choices={shown.map((l) => ({
            name: `${chosen.has(l.name) ? "■" : "□"} ${l.name}`,
          }))}
          index={cursor}
          height={12}
          width={52}
        />
      ) : (
        <text fg={C.dim}>Loading labels…</text>
      )}
    </Modal>
  );
};

// OpenTUI's <textarea>: enter posts, shift+enter or alt+enter starts a new line
const EDITOR_KEYS = [
  { action: "submit" as const, name: "return" },
  { action: "newline" as const, name: "return", shift: true },
  { action: "newline" as const, meta: true, name: "return" },
];

const Editor = ({
  placeholder,
  onSubmit,
}: {
  placeholder: string;
  onSubmit: (body: string) => void;
}) => {
  const ref = useRef<TextareaRenderable>(null);
  return (
    <textarea
      ref={ref}
      focused
      placeholder={placeholder}
      height={6}
      textColor={C.text}
      placeholderColor={C.faint}
      backgroundColor={C.bg}
      focusedBackgroundColor={C.bg}
      keyBindings={EDITOR_KEYS}
      onSubmit={() => onSubmit(ref.current?.plainText.trim() ?? "")}
    />
  );
};

const REVIEW_CHOICES: { event: ReviewEvent; label: string }[] = [
  { event: "COMMENT", label: "Comment" },
  { event: "APPROVE", label: "Approve" },
  { event: "REQUEST_CHANGES", label: "Request changes" },
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
  const [choice, setChoice] = useState<(typeof REVIEW_CHOICES)[number] | null>(
    null
  );

  useKeyboard((key: KeyEvent) => {
    if (keyId(key) === "escape") {
      if (choice) {
        setChoice(null);
      } else {
        onClose();
      }
    }
  });

  const submit = (body: string) => {
    // GitHub needs a message for comments and change requests
    if (!choice || (choice.event !== "APPROVE" && !body)) {
      return;
    }
    onClose();
    onSubmit(choice.event, body);
  };

  return (
    <Modal
      title={`Review #${pr.number}`}
      width={64}
      footer={
        choice
          ? `⏎ submit · esc back${choice.event === "APPROVE" ? " · message optional" : ""}`
          : "↑↓ choose · ⏎ next · esc cancel"
      }
    >
      <text fg={C.dim} marginBottom={1} wrapMode="none" truncate>
        {pr.title}
      </text>
      {choice ? (
        <>
          <text fg={C.accent} attributes={BOLD} marginBottom={1}>
            {choice.label}
          </text>
          <Editor placeholder="leave a message…" onSubmit={submit} />
        </>
      ) : (
        <Choices
          choices={REVIEW_CHOICES.map((c) => ({ name: c.label }))}
          focused
          height={REVIEW_CHOICES.length}
          width={60}
          onSelect={(i) => setChoice(REVIEW_CHOICES[i] ?? null)}
        />
      )}
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
  useKeyboard((key: KeyEvent) => {
    if (keyId(key) === "escape") {
      onPreview(current);
      onClose();
    }
  });
  const themeAt = (i: number) => THEME_CHOICES[i]?.id ?? current;
  return (
    <Modal title="Theme" width={56} footer="↑↓ preview · ⏎ keep · esc cancel">
      <Choices
        choices={THEME_CHOICES.map((t) => ({
          hint: t.id === current ? "current" : "",
          name: t.label,
        }))}
        index={Math.max(
          0,
          THEME_CHOICES.findIndex((t) => t.id === current)
        )}
        focused
        height={THEME_CHOICES.length}
        width={52}
        onChange={(i) => onPreview(themeAt(i))}
        onSelect={(i) => {
          onClose();
          onChoose(themeAt(i));
        }}
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
  useKeyboard((key: KeyEvent) => {
    if (keyId(key) === "escape") {
      onClose();
    }
  });
  return (
    <Modal
      title={`Copy · #${pr.number}`}
      width={72}
      footer="↑↓ choose · ⏎ copy · esc close"
    >
      <Choices
        choices={choices.map((c) => ({
          hint: fit(c.value, 40),
          name: c.label,
        }))}
        focused
        height={choices.length}
        width={68}
        onSelect={(i) => {
          const choice = choices[i];
          onClose();
          if (choice) {
            onCopy(choice);
          }
        }}
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
  useKeyboard((key: KeyEvent) => {
    if (keyId(key) === "escape") {
      onClose();
    }
  });
  return (
    <Modal
      title={title}
      width={72}
      footer="⏎ post · shift+⏎ new line · esc cancel"
    >
      <text fg={C.faint} marginBottom={1} wrapMode="none" truncate>
        {context}
      </text>
      <Editor
        placeholder="write a comment…"
        onSubmit={(body) => {
          if (body) {
            onClose();
            onSubmit(body);
          }
        }}
      />
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
  const { cursor, move } = useSearchCursor(shown.length);
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
      <Choices
        choices={shown.map((f) => ({
          hint: `+${f.additions} −${f.deletions}`,
          name: f.path,
        }))}
        index={cursor}
        height={16}
        width={76}
      />
    </Modal>
  );
};
