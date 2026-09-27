// Nerd Font codicons, with plain fallbacks for fonts without them ("icons": "plain").

const NERD = {
  closed: "",
  draft: "",
  github: "",
  merged: "",
  pr: "",
};

const PLAIN = {
  closed: "×",
  draft: "◇",
  github: "◉",
  merged: "✓",
  pr: "↳",
};

export type IconStyle = "nerd" | "plain";

export const ICONS = { ...NERD };

export const setIconStyle = (style: IconStyle) => {
  Object.assign(ICONS, style === "plain" ? PLAIN : NERD);
};
