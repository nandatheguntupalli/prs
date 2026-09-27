import { useRenderer } from "@opentui/react";
import { useEffect, useState } from "react";

import type { Config } from "../config.ts";
import { applyTheme, resolveTheme } from "../theme.ts";
import type { ThemeChoice } from "../theme.ts";

export const useTheme = (config: Config) => {
  const renderer = useRenderer();
  const [choice, setChoice] = useState<ThemeChoice>(config.theme);
  const [preview, setPreview] = useState<ThemeChoice | null>(null);
  const [appearance, setAppearance] = useState(renderer.themeMode);
  useEffect(() => {
    const onMode = (mode: "dark" | "light") => setAppearance(mode);
    renderer.on("theme_mode", onMode);
    return () => {
      renderer.off("theme_mode", onMode);
    };
  }, [renderer]);
  const name = resolveTheme(preview ?? choice, appearance);
  // components read C directly, so set it before they render
  applyTheme(name);
  return { choice, name, setChoice, setPreview };
};
