import { Window } from "happy-dom";

// Bun's happy-dom environment leaves the DOM globals undefined with the
// installed version, so register them here for `bun test`.
const win = new Window({ url: "http://localhost/" });
const g = globalThis as unknown as Record<string, unknown>;
for (const key of Object.getOwnPropertyNames(win)) {
  if (!(key in g)) {
    try {
      g[key] = (win as unknown as Record<string, unknown>)[key];
    } catch {}
  }
}
g.window = win;
g.document = win.document;
g.navigator = win.navigator;
g.location = win.location;
