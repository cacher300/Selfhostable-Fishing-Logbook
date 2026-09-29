// Legacy persistence entry point kept while call sites move to store.commit().
import { setState, state } from "./app-state.js";
import { commit, persistedDocument } from "./store.js";

/**
 * Persist in-place edits made directly to `state`.
 * Prefer `commit((draft) => { ... })` from store.js for new code.
 */
export async function saveState() {
  const edited = structuredClone(state);
  try {
    await commit(() => edited);
  } catch (error) {
    const previous = persistedDocument();
    if (previous) setState(structuredClone(previous));
    throw error;
  }
}
