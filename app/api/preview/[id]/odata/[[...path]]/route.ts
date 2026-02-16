import { NextResponse } from "next/server";
import { getPreviewEntry } from "@/lib/previewStore";
import { parsePreviewToken } from "@/lib/previewToken";

// Estrutura minima de coluna para gerar metadata OData V2.
interface PreviewColumn {
  key: string;
  label: string;
  type: "string" | "number" | "date" | "boolean";
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function parseStringLiteral(value: string): string {
  if (
    value.length >= 2 &&
    value.startsWith("'") &&
    value.endsWith("'")
  ) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  return value;
}

function toODataJsonResponse(payload: unknown, status = 200) {
  // Headers V2 ajudam componentes SAPUI5 (SmartTable/SmartFilterBar)
  // a tratar o endpoint como um servico OData real.
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store",
      DataServiceVersion: "2.0",
      "OData-Version": "2.0",
    },
  });
}

function normalizeColumns(preview: {
  modelData: Record<string, unknown>;
}): PreviewColumn[] {
  // Preferimos metadados declarados no payload (__previewColumns).
  const candidate = preview.modelData.__previewColumns;
  if (Array.isArray(candidate) && candidate.length > 0) {
    return candidate
      .map((item) => {
        if (typeof item !== "object" || item === null) {
          return null;
        }

        const key = typeof (item as { key?: unknown }).key === "string"
          ? ((item as { key: string }).key || "").trim()
          : "";
        const label = typeof (item as { label?: unknown }).label === "string"
          ? ((item as { label: string }).label || "").trim()
          : key;
        const rawType = (item as { type?: unknown }).type;
        const type =
          rawType === "number" ||
          rawType === "date" ||
          rawType === "boolean"
            ? rawType
            : "string";

        if (!key) {
          return null;
        }

        return { key, label: label || key, type } satisfies PreviewColumn;
      })
      .filter((item): item is PreviewColumn => item !== null);
  }

  const items = Array.isArray(preview.modelData.items) ? preview.modelData.items : [];
  const first = items.find(
    (item): item is Record<string, unknown> =>
      typeof item === "object" && item !== null,
  );
  if (!first) {
    return [];
  }

  return Object.keys(first).map((key) => ({
    key,
    label: key,
    type: "string",
  }));
}

function normalizeRows(preview: {
  modelData: Record<string, unknown>;
}): Record<string, unknown>[] {
  // __row_id vira chave tecnica da entidade no mock OData.
  const items = Array.isArray(preview.modelData.items) ? preview.modelData.items : [];
  return items
    .filter(
      (item): item is Record<string, unknown> =>
        typeof item === "object" && item !== null,
    )
    .map((row, index) => ({
      __row_id: String(index + 1),
      ...row,
    }));
}

function evaluateClause(row: Record<string, unknown>, clause: string): boolean {
  // Suporte basico a funcoes comuns emitidas por filtros do UI5.
  const substringMatch = clause.match(
    /^substringof\('((?:''|[^'])*)',\s*([A-Za-z_][A-Za-z0-9_]*)\)$/i,
  );
  if (substringMatch) {
    const needle = substringMatch[1].replace(/''/g, "'").toLowerCase();
    const field = substringMatch[2];
    return String(row[field] ?? "").toLowerCase().includes(needle);
  }

  const containsMatch = clause.match(
    /^contains\(([A-Za-z_][A-Za-z0-9_]*),\s*'((?:''|[^'])*)'\)$/i,
  );
  if (containsMatch) {
    const field = containsMatch[1];
    const needle = containsMatch[2].replace(/''/g, "'").toLowerCase();
    return String(row[field] ?? "").toLowerCase().includes(needle);
  }

  const startsWithMatch = clause.match(
    /^startswith\(([A-Za-z_][A-Za-z0-9_]*),\s*'((?:''|[^'])*)'\)$/i,
  );
  if (startsWithMatch) {
    const field = startsWithMatch[1];
    const prefix = startsWithMatch[2].replace(/''/g, "'").toLowerCase();
    return String(row[field] ?? "").toLowerCase().startsWith(prefix);
  }

  const comparisonMatch = clause.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s+(eq|ne|gt|ge|lt|le)\s+(.+)$/i,
  );
  if (!comparisonMatch) {
    return true;
  }

  const [, field, op, rawRight] = comparisonMatch;
  const left = row[field];
  const rightToken = rawRight.trim();

  let right: unknown = rightToken;
  if (/^'.*'$/.test(rightToken)) {
    right = parseStringLiteral(rightToken);
  } else if (/^(true|false)$/i.test(rightToken)) {
    right = rightToken.toLowerCase() === "true";
  } else if (/^null$/i.test(rightToken)) {
    right = null;
  } else if (!Number.isNaN(Number(rightToken))) {
    right = Number(rightToken);
  }

  // SmartFilterBar may emit eq '' for untouched inputs.
  // Treat empty/null comparison as no-op in preview mode.
  if (
    (op.toLowerCase() === "eq" || op.toLowerCase() === "ne") &&
    (right === "" || right === null)
  ) {
    return true;
  }

  const leftNumber = Number(left);
  const rightNumber = Number(right);
  const canUseNumber =
    typeof left !== "boolean" &&
    typeof right !== "boolean" &&
    !Number.isNaN(leftNumber) &&
    !Number.isNaN(rightNumber);

  if (canUseNumber) {
    switch (op.toLowerCase()) {
      case "eq":
        return leftNumber === rightNumber;
      case "ne":
        return leftNumber !== rightNumber;
      case "gt":
        return leftNumber > rightNumber;
      case "ge":
        return leftNumber >= rightNumber;
      case "lt":
        return leftNumber < rightNumber;
      case "le":
        return leftNumber <= rightNumber;
      default:
        return true;
    }
  }

  const leftValue = String(left ?? "").toLowerCase();
  const rightValue = String(right ?? "").toLowerCase();
  switch (op.toLowerCase()) {
    case "eq":
      return leftValue === rightValue;
    case "ne":
      return leftValue !== rightValue;
    case "gt":
      return leftValue > rightValue;
    case "ge":
      return leftValue >= rightValue;
    case "lt":
      return leftValue < rightValue;
    case "le":
      return leftValue <= rightValue;
    default:
      return true;
  }
}

function applyFilter(rows: Record<string, unknown>[], filterExpr: string | null) {
  if (!filterExpr || !filterExpr.trim()) {
    return rows;
  }

  const clauses = filterExpr
    .split(/\s+and\s+/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
  if (clauses.length === 0) {
    return rows;
  }

  return rows.filter((row) =>
    clauses.every((clause) => evaluateClause(row, clause)),
  );
}

function applyOrderBy(rows: Record<string, unknown>[], orderBy: string | null) {
  if (!orderBy || !orderBy.trim()) {
    return rows;
  }

  const segments = orderBy
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const [field, dir] = part.split(/\s+/);
      return {
        field: (field || "").trim(),
        desc: (dir || "").toLowerCase() === "desc",
      };
    })
    .filter((part) => part.field);

  if (segments.length === 0) {
    return rows;
  }

  return [...rows].sort((a, b) => {
    for (const segment of segments) {
      const left = a[segment.field];
      const right = b[segment.field];

      if (left === right) {
        continue;
      }

      const leftNum = Number(left);
      const rightNum = Number(right);
      const numeric =
        !Number.isNaN(leftNum) &&
        !Number.isNaN(rightNum) &&
        typeof left !== "boolean" &&
        typeof right !== "boolean";

      let diff = 0;
      if (numeric) {
        diff = leftNum - rightNum;
      } else {
        diff = String(left ?? "").localeCompare(String(right ?? ""));
      }

      if (diff !== 0) {
        return segment.desc ? -diff : diff;
      }
    }

    return 0;
  });
}

function applySelect(
  rows: Record<string, unknown>[],
  selectExpr: string | null,
): Record<string, unknown>[] {
  // Aplica projecao simples de campos como faria um backend OData.
  if (!selectExpr || !selectExpr.trim()) {
    return rows;
  }

  const selectedFields = Array.from(
    new Set(
      selectExpr
        .split(",")
        .map((field) => field.trim())
        .filter(Boolean)
        .map((field) => field.split("/").pop() || field)
        .filter(Boolean),
    ),
  );

  if (selectedFields.length === 0) {
    return rows;
  }

  if (!selectedFields.includes("__row_id")) {
    selectedFields.push("__row_id");
  }

  return rows.map((row) => {
    const selected: Record<string, unknown> = {};
    selectedFields.forEach((field) => {
      if (field in row) {
        selected[field] = row[field];
      }
    });
    return selected;
  });
}

function attachEntityMetadata(
  rows: Record<string, unknown>[],
  serviceRootUrl: string,
): Record<string, unknown>[] {
  // SmartTable espera __metadata por linha no formato V2.
  return rows.map((row) => {
    const idValue = String(row.__row_id ?? "");
    return {
      __metadata: {
        uri: `${serviceRootUrl}PreviewSet('${encodeURIComponent(idValue)}')`,
        type: "PreviewService.PreviewType",
      },
      ...row,
    };
  });
}

function edmTypeForColumn(type: PreviewColumn["type"]): string {
  switch (type) {
    case "number":
      return "Edm.Decimal";
    case "boolean":
      return "Edm.Boolean";
    case "date":
      return "Edm.String";
    case "string":
    default:
      return "Edm.String";
  }
}

function buildMetadataXml(columns: PreviewColumn[]): string {
  // Metadata dinamica com base nos campos enviados no preview.
  const properties = columns
    .map((column) => {
      const propName = escapeXml(column.key);
      const label = escapeXml(column.label || column.key);
      const type = edmTypeForColumn(column.type);
      if (type === "Edm.Decimal") {
        return `<Property Name="${propName}" Type="${type}" Nullable="true" Precision="16" Scale="3" sap:label="${label}" />`;
      }
      return `<Property Name="${propName}" Type="${type}" Nullable="true" sap:label="${label}" />`;
    })
    .join("");

  return `<?xml version="1.0" encoding="utf-8"?>
<edmx:Edmx Version="1.0" xmlns:edmx="http://schemas.microsoft.com/ado/2007/06/edmx">
  <edmx:DataServices m:DataServiceVersion="2.0" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
    <Schema Namespace="PreviewService" xmlns="http://schemas.microsoft.com/ado/2008/09/edm" xmlns:sap="http://www.sap.com/Protocols/SAPData">
      <EntityType Name="PreviewType">
        <Key>
          <PropertyRef Name="__row_id" />
        </Key>
        <Property Name="__row_id" Type="Edm.String" Nullable="false" sap:label="Row ID" />
        ${properties}
      </EntityType>
      <EntityContainer Name="PreviewService_Entities" m:IsDefaultEntityContainer="true">
        <EntitySet Name="PreviewSet" EntityType="PreviewService.PreviewType" />
      </EntityContainer>
    </Schema>
  </edmx:DataServices>
</edmx:Edmx>`;
}

export async function GET(
  req: Request,
  context: {
    params:
      | { id: string; path?: string[] }
      | Promise<{ id: string; path?: string[] }>;
  },
) {
  const params = await context.params;
  const rawPath = params.path ?? [];
  let path = rawPath;

  const url = new URL(req.url);
  const tokenFromQuery = url.searchParams.get("token");
  let tokenFromPath: string | null = null;
  if (rawPath[0] === "token" && rawPath[1]) {
    // Opcao de token no path para facilitar chamadas internas do runtime UI5.
    try {
      tokenFromPath = decodeURIComponent(rawPath[1]);
    } catch {
      tokenFromPath = rawPath[1];
    }
    path = rawPath.slice(2);
  }

  const referer = req.headers.get("referer");
  let tokenFromReferer: string | null = null;
  if (referer) {
    try {
      tokenFromReferer = new URL(referer).searchParams.get("token");
    } catch {
      tokenFromReferer = null;
    }
  }

  const preview =
    getPreviewEntry(params.id) ??
    (tokenFromPath ? parsePreviewToken(tokenFromPath) : null) ??
    (tokenFromQuery ? parsePreviewToken(tokenFromQuery) : null) ??
    (tokenFromReferer ? parsePreviewToken(tokenFromReferer) : null);

  if (!preview) {
    return NextResponse.json({ error: "Preview not found or expired" }, { status: 404 });
  }

  const firstSegment = path[0] ?? "";

  const columns = normalizeColumns(preview);
  const rows = normalizeRows(preview);

  if (!firstSegment) {
    // Service document (root do servico OData).
    return toODataJsonResponse({
      d: {
        EntitySets: ["PreviewSet"],
      },
    });
  }

  if (firstSegment === "$metadata") {
    const metadataXml = buildMetadataXml(columns);
    return new NextResponse(metadataXml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store",
        DataServiceVersion: "2.0",
        "OData-Version": "2.0",
      },
    });
  }

  if (!firstSegment.startsWith("PreviewSet")) {
    return toODataJsonResponse({ error: "Entity set not found" }, 404);
  }

  const filterExpr = url.searchParams.get("$filter");
  const orderByExpr = url.searchParams.get("$orderby");
  const selectExpr = url.searchParams.get("$select");
  const skip = Math.max(0, Number.parseInt(url.searchParams.get("$skip") ?? "0", 10) || 0);
  const topRaw = Number.parseInt(url.searchParams.get("$top") ?? "", 10);
  const top = Number.isFinite(topRaw) && topRaw > 0 ? topRaw : rows.length;

  const filtered = applyFilter(rows, filterExpr);
  if ((path[1] ?? "").toLowerCase() === "$count") {
    return new NextResponse(String(filtered.length), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        DataServiceVersion: "2.0",
        "OData-Version": "2.0",
      },
    });
  }

  const ordered = applyOrderBy(filtered, orderByExpr);
  const paged = ordered.slice(skip, skip + top);
  const selected = applySelect(paged, selectExpr);
  const serviceRootUrl = `${url.origin}${url.pathname.replace(/PreviewSet.*$/i, "")}`;
  const withMetadata = attachEntityMetadata(selected, serviceRootUrl);

  return toODataJsonResponse({
    d: {
      results: withMetadata,
      __count: String(filtered.length),
    },
  });
}

export async function HEAD(
  req: Request,
) {
  void req;
  // Alguns clientes OData fazem HEAD para validar disponibilidade.
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
      DataServiceVersion: "2.0",
      "OData-Version": "2.0",
    },
  });
}

export async function OPTIONS() {
  // Preflight/CORS basico do endpoint mock.
  return new NextResponse(null, {
    status: 204,
    headers: {
      Allow: "GET,HEAD,OPTIONS",
      "Cache-Control": "no-store",
    },
  });
}
