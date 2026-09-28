// Nerd Font codicons, with plain fallbacks for fonts without them ("icons": "plain").

const NERD = {
  // rounded ends for pills
  capL: "",
  capR: "",
  closed: "",
  draft: "",
  github: "",
  merged: "",
  pr: "",
};

const PLAIN = {
  capL: "▐",
  capR: "▌",
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
