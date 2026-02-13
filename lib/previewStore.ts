import { randomUUID } from "crypto";
import type { PreviewControllerConfig } from "@/lib/preview/controllerConfig";

export interface PreviewEntry {
  id: string;
  name: string;
  viewXml: string;
  controller: PreviewControllerConfig;
  modelData: Record<string, unknown>;
  createdAt: string;
}

const PREVIEW_TTL_MS = 1000 * 60 * 60;

type PreviewStore = Map<string, PreviewEntry>;

function getStore(): PreviewStore {
  const globalScope = globalThis as typeof globalThis & {
    __previewStore?: PreviewStore;
  };

  if (!globalScope.__previewStore) {
    globalScope.__previewStore = new Map<string, PreviewEntry>();
  }

  return globalScope.__previewStore;
}

function purgeExpiredEntries(store: PreviewStore) {
  const now = Date.now();

  for (const [id, entry] of store.entries()) {
    const createdAt = new Date(entry.createdAt).getTime();
    if (Number.isNaN(createdAt) || now - createdAt > PREVIEW_TTL_MS) {
      store.delete(id);
    }
  }
}

export function createPreviewEntry(
  input: Omit<PreviewEntry, "id" | "createdAt">,
): PreviewEntry {
  const store = getStore();
  purgeExpiredEntries(store);

  const entry: PreviewEntry = {
    ...input,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
  };

  store.set(entry.id, entry);
  return entry;
}

export function getPreviewEntry(id: string): PreviewEntry | null {
  const store = getStore();
  purgeExpiredEntries(store);
  return store.get(id) ?? null;
}
