import { useEffect, useState } from "react";

import { clampSize, DEFAULT_SIZES, saveSizes } from "../layout.ts";
import type { PaneSizes } from "../layout.ts";

export type Resizing = keyof PaneSizes | null;

export const sidebarCells = (width: number, shown: boolean, size: number) =>
  shown ? Math.min(width - 30, Math.max(28, Math.round(width * size))) : 0;

export const usePaneSizes = (initial: PaneSizes, width: number) => {
  const [sizes, setSizes] = useState(initial);
  const [resizing, setResizing] = useState<Resizing>(null);
  // don't write layout.json until something was actually resized
  const [changed, setChanged] = useState(false);

  useEffect(() => {
    if (!changed) {
      return;
    }
    const timer = setTimeout(() => saveSizes(sizes), 400);
    return () => clearTimeout(timer);
  }, [sizes, changed]);

  const resize = (pane: keyof PaneSizes, fraction: number) => {
    setChanged(true);
    setSizes((s) => ({ ...s, [pane]: clampSize(pane, fraction) }));
  };

  const reset = () => {
    setChanged(true);
    setSizes(DEFAULT_SIZES);
  };

  // the drag is tracked at the root, so this fires for any pointer move while held
  const dragTo = (x: number) => {
    if (resizing === "sidebar") {
      resize("sidebar", (width - x - 1) / width);
    }
  };

  // the debounced save may not have run yet when quitting
  const saveNow = () => (changed ? saveSizes(sizes) : Promise.resolve());

  return { dragTo, reset, resize, resizing, saveNow, setResizing, sizes };
};
