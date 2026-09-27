import { helpSections } from "../commands.ts";
import type { Cmd, Screen } from "../commands.ts";
import type { PR, submitReview } from "../github/prs.ts";
import type { ThemeChoice } from "../theme.ts";
import type { ParsedDiff } from "./diff-model.ts";
import {
  CommandPalette,
  ComposeModal,
  CopyModal,
  FilesModal,
  HelpModal,
  LabelsModal,
  ReviewModal,
  ThemeModal,
} from "./modals.tsx";

export type ModalState =
  | { kind: "palette" }
  | { kind: "help" }
  | { kind: "theme" }
  | { kind: "files" }
  | { kind: "labels"; pr: PR }
  | { kind: "review"; pr: PR }
  | { kind: "copy"; pr: PR }
  | {
      kind: "compose";
      title: string;
      context: string;
      handleSubmit: (body: string) => unknown;
    };

export const ModalHost = ({
  modal,
  commands,
  screen,
  themeChoice,
  files,
  onClose,
  onTheme,
  onPreview,
  onJumpFile,
  onLabels,
  onReview,
  onCopy,
}: {
  modal: ModalState | null;
  commands: Cmd[];
  screen: Screen;
  themeChoice: ThemeChoice;
  files: ParsedDiff["files"];
  onClose: () => void;
  onTheme: (choice: ThemeChoice) => void;
  onPreview: (choice: ThemeChoice | null) => void;
  onJumpFile: (path: string) => void;
  onLabels: (pr: PR, names: string[]) => void;
  onReview: (
    pr: PR,
    event: Parameters<typeof submitReview>[1],
    body: string
  ) => void;
  onCopy: (label: string, value: string) => void;
}) => {
  switch (modal?.kind) {
    case "palette": {
      return (
        <CommandPalette
          commands={commands
            .filter((c) => !c.paletteHidden && c.screens.includes(screen))
            .map((c) => ({
              id: c.id,
              keys: c.keys.map((k) => k.replace("return", "⏎")).join(" "),
              label: c.label,
              run: c.run,
            }))}
          onClose={onClose}
        />
      );
    }
    case "help": {
      return (
        <HelpModal
          sections={helpSections(commands.filter((c) => !c.paletteHidden))}
          onClose={onClose}
        />
      );
    }
    case "theme": {
      return (
        <ThemeModal
          current={themeChoice}
          onPreview={onPreview}
          onChoose={onTheme}
          onClose={() => {
            onPreview(null);
            onClose();
          }}
        />
      );
    }
    case "files": {
      return <FilesModal files={files} onJump={onJumpFile} onClose={onClose} />;
    }
    case "labels": {
      const { pr } = modal;
      return (
        <LabelsModal
          pr={pr}
          onApply={(names) => onLabels(pr, names)}
          onClose={onClose}
        />
      );
    }
    case "review": {
      const { pr } = modal;
      return (
        <ReviewModal
          pr={pr}
          onSubmit={(event, body) => onReview(pr, event, body)}
          onClose={onClose}
        />
      );
    }
    case "copy": {
      return (
        <CopyModal
          pr={modal.pr}
          onCopy={(choice) => onCopy(choice.label, choice.value)}
          onClose={onClose}
        />
      );
    }
    case "compose": {
      return (
        <ComposeModal
          title={modal.title}
          context={modal.context}
          onSubmit={modal.handleSubmit}
          onClose={onClose}
        />
      );
    }
    default: {
      return null;
    }
  }
};
