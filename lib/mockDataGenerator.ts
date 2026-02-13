import { FieldMapping } from "./types";

export function generateMockData(
  fields: FieldMapping[],
  rowCount: number = 10,
): Record<string, unknown>[] {
  const data: Record<string, unknown>[] = [];

  for (let i = 0; i < rowCount; i++) {
    const row: Record<string, unknown> = {};

    fields.forEach((field) => {
      row[field.displayName] = generateMockValue(field, i);
    });

    data.push(row);
  }

  return data;
}

function generateMockValue(field: FieldMapping, index: number): unknown {
  const { type, displayName } = field;

  switch (type) {
    case "string":
      return generateStringValue(displayName, index);

    case "number":
      return generateNumberValue(displayName, index);

    case "date":
      return generateDateValue();

    case "boolean":
      return index % 2 === 0;

    default:
      return `Value ${index + 1}`;
  }
}

function generateStringValue(fieldName: string, index: number): string {
  const lowerName = fieldName.toLowerCase();

  if (lowerName.includes("order")) {
    return `SO-${String(1000 + index).padStart(6, "0")}`;
  }
  if (lowerName.includes("item") || lowerName.includes("product")) {
    const products = [
      "Laptop",
      "Mouse",
      "Keyboard",
      "Monitor",
      "Headphones",
      "Webcam",
      "USB Cable",
      "Charger",
    ];
    return products[index % products.length];
  }
  if (lowerName.includes("customer") || lowerName.includes("client")) {
    const customers = [
      "Acme Corp",
      "TechStart Inc",
      "Global Solutions",
      "Enterprise Ltd",
      "Innovation Co",
    ];
    return customers[index % customers.length];
  }
  if (lowerName.includes("status")) {
    const statuses = [
      "Open",
      "In Progress",
      "Completed",
      "Cancelled",
      "On Hold",
    ];
    return statuses[index % statuses.length];
  }
  if (lowerName.includes("name")) {
    return `Item ${index + 1}`;
  }
  if (
    lowerName.includes("text") ||
    lowerName.includes("description") ||
    lowerName.includes("comment")
  ) {
    const descriptions = [
      "Standard delivery",
      "Express shipping required",
      "Customer requested gift wrap",
      "Bulk order discount applied",
      "Priority processing",
    ];
    return descriptions[index % descriptions.length];
  }

  return `${fieldName} ${index + 1}`;
}

function generateNumberValue(fieldName: string, index: number): number {
  const lowerName = fieldName.toLowerCase();

  if (lowerName.includes("quantity") || lowerName.includes("qty")) {
    return Math.floor(Math.random() * 100) + 1;
  }
  if (
    lowerName.includes("price") ||
    lowerName.includes("amount") ||
    lowerName.includes("total")
  ) {
    return parseFloat((Math.random() * 10000 + 100).toFixed(2));
  }
  if (lowerName.includes("id")) {
    return 1000 + index;
  }

  return Math.floor(Math.random() * 1000) + 1;
}

function generateDateValue(): string {
  const now = new Date();
  const daysOffset = Math.floor(Math.random() * 90) - 45;
  const date = new Date(now.getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return date.toISOString().split("T")[0];
}

