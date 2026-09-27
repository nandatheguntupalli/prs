import { useEffect, useEffectEvent, useState } from "react";

import { errorMessage } from "../github/client.ts";

// A null key skips loading. A value loaded for an older key counts as not loaded.
export const useLoader = <T>(key: string | null, load: () => Promise<T>) => {
  const [state, setState] = useState<{
    key: string;
    value: T | null;
    error: string;
  } | null>(null);
  const [nonce, setNonce] = useState(0);
  const run = useEffectEvent(load);
  const request = key === null ? null : `${key}\u0000${nonce}`;

  useEffect(() => {
    if (request === null || key === null) {
      return;
    }
    let live = true;
    const go = async () => {
      try {
        const value = await run();
        if (live) {
          setState({ error: "", key, value });
        }
      } catch (error) {
        if (live) {
          setState({ error: errorMessage(error), key, value: null });
        }
      }
    };
    go();
    return () => {
      live = false;
    };
  }, [key, request]);

  const current = state && state.key === key ? state : null;
  return {
    error: current?.error ?? "",
    loaded: current !== null,
    reload: () => setNonce((n) => n + 1),
    value: current?.value ?? null,
  };
};
