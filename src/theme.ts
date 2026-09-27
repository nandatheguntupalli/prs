// Color themes. `C` is one shared object whose values are swapped in place when the theme changes,
// so every component can read colors directly; the app re-renders on a theme change.

export interface Palette {
  bg: string;
  // raised surfaces: dialogs, the selected row, file headers
  panel: string;
  selected: string;
  border: string;
  text: string;
  dim: string;
  faint: string;
  accent: string;
  // a muted accent for chips and the active tab
  accentSoft: string;
  green: string;
  red: string;
  yellow: string;
  blue: string;
  cyan: string;
  purple: string;
  // tints behind added / removed diff lines
  addBg: string;
  delBg: string;
}

export type ThemeName = "midnight" | "graphite" | "nord" | "tokyo" | "paper";

export const THEMES: Record<ThemeName, { label: string; palette: Palette }> = {
  graphite: {
    label: "Graphite",
    palette: {
      accent: "#8ab4f8",
      accentSoft: "#26324a",
      addBg: "#1a2e22",
      bg: "#17181c",
      blue: "#8ab4f8",
      border: "#2c2e36",
      cyan: "#7fd4e8",
      delBg: "#35191c",
      dim: "#8b8e98",
      faint: "#4a4d57",
      green: "#81c995",
      panel: "#1f2127",
      purple: "#c58af9",
      red: "#f28b82",
      selected: "#23252d",
      text: "#e8eaed",
      yellow: "#fdd663",
    },
  },
  midnight: {
    label: "Midnight",
    palette: {
      accent: "#a78bfa",
      accentSoft: "#2a2345",
      addBg: "#0f2a1a",
      bg: "#000000",
      blue: "#60a5fa",
      border: "#262626",
      cyan: "#67e8f9",
      delBg: "#2d1316",
      dim: "#8a8a8a",
      faint: "#46464f",
      green: "#4ade80",
      panel: "#111116",
      purple: "#c084fc",
      red: "#f87171",
      selected: "#18181f",
      text: "#e5e5e5",
      yellow: "#fbbf24",
    },
  },
  nord: {
    label: "Nord",
    palette: {
      accent: "#88c0d0",
      accentSoft: "#34445a",
      addBg: "#2f3d33",
      bg: "#2e3440",
      blue: "#81a1c1",
      border: "#434c5e",
      cyan: "#8fbcbb",
      delBg: "#45353b",
      dim: "#9aa5b8",
      faint: "#5b6579",
      green: "#a3be8c",
      panel: "#3b4252",
      purple: "#b48ead",
      red: "#bf616a",
      selected: "#3b4252",
      text: "#eceff4",
      yellow: "#ebcb8b",
    },
  },
  paper: {
    label: "Paper",
    palette: {
      accent: "#6d28d9",
      accentSoft: "#ede9fe",
      addBg: "#dcfce7",
      bg: "#fbfbfa",
      blue: "#1d4ed8",
      border: "#e2e2e0",
      cyan: "#0e7490",
      delBg: "#fee2e2",
      dim: "#6b6b6b",
      faint: "#b5b5b2",
      green: "#15803d",
      panel: "#f1f1ef",
      purple: "#7e22ce",
      red: "#b91c1c",
      selected: "#ecebe8",
      text: "#1c1c1c",
      yellow: "#a16207",
    },
  },
  tokyo: {
    label: "Tokyo Night",
    palette: {
      accent: "#bb9af7",
      accentSoft: "#2e2a4a",
      addBg: "#1f2d2a",
      bg: "#1a1b26",
      blue: "#7aa2f7",
      border: "#292e42",
      cyan: "#7dcfff",
      delBg: "#35202a",
      dim: "#8189ab",
      faint: "#414868",
      green: "#9ece6a",
      panel: "#1f2335",
      purple: "#bb9af7",
      red: "#f7768e",
      selected: "#24283b",
      text: "#c0caf5",
      yellow: "#e0af68",
    },
  },
};

// "system" follows the terminal's light / dark appearance
export type ThemeChoice = ThemeName | "system";

export const THEME_CHOICES: { id: ThemeChoice; label: string }[] = [
  { id: "system", label: "System (light or dark to match the terminal)" },
  ...(Object.keys(THEMES) as ThemeName[]).map((id) => ({
    id,
    label: THEMES[id].label,
  })),
];

export const C: Palette = { ...THEMES.midnight.palette };

export const resolveTheme = (
  choice: ThemeChoice,
  mode: "dark" | "light" | null
): ThemeName => {
  if (choice !== "system") {
    return choice;
  }
  return mode === "light" ? "paper" : "midnight";
};

export const applyTheme = (name: ThemeName) => {
  Object.assign(C, THEMES[name].palette);
};

export type Flash = (text: string, color?: string) => void;
