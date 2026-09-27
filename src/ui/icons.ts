// Glyphs from Nerd Fonts' codicons, with plain fallbacks for fonts that don't have them
// ("icons": "plain" in ~/.config/prs/config.json).

const NERD = {
  // codicon git-pull-request-closed, git-pull-request-draft, git-merge and git-pull-request
  closed: "",
  draft: "",
  merged: "",
  pr: "",
};

const PLAIN = {
  closed: "×",
  draft: "◇",
  merged: "✓",
  pr: "↳",
};

export type IconStyle = "nerd" | "plain";

export const ICONS = { ...NERD };

export const setIconStyle = (style: IconStyle) => {
  Object.assign(ICONS, style === "plain" ? PLAIN : NERD);
};
