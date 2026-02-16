function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export interface PreviewControllerFilter {
  field: string;
  value: string;
}

export interface PreviewControllerSort {
  field: string;
  direction: "asc" | "desc";
}

export interface PreviewControllerConfig {
  version: 1;
  initialFilters?: PreviewControllerFilter[];
  defaultSort?: PreviewControllerSort;
}

export const DEFAULT_PREVIEW_CONTROLLER: PreviewControllerConfig = {
  version: 1,
};

export function normalizePreviewControllerConfig(
  input: unknown,
): PreviewControllerConfig {
  // Entrada sempre passa por normalizacao para impedir shape invalido.
  if (!isRecord(input) || input.version !== 1) {
    return { ...DEFAULT_PREVIEW_CONTROLLER };
  }

  const normalized: PreviewControllerConfig = {
    version: 1,
  };

  if (Array.isArray(input.initialFilters)) {
    const filters = input.initialFilters
      .filter(isRecord)
      .map((item) => {
        const field =
          typeof item.field === "string" ? normalizeText(item.field) : "";
        const value =
          typeof item.value === "string" ? normalizeText(item.value) : "";

        if (!field || !value) {
          return null;
        }

        return { field, value } satisfies PreviewControllerFilter;
      })
      .filter((item): item is PreviewControllerFilter => item !== null)
      .slice(0, 20);

    if (filters.length > 0) {
      normalized.initialFilters = filters;
    }
  }

  if (isRecord(input.defaultSort)) {
    const field =
      typeof input.defaultSort.field === "string"
        ? normalizeText(input.defaultSort.field)
        : "";
    const direction =
      input.defaultSort.direction === "desc" ? "desc" : "asc";

    if (field) {
      normalized.defaultSort = {
        field,
        direction,
      };
    }
  }

  return normalized;
}
