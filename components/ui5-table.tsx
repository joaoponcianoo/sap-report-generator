"use client";

import React from "react";
import { FieldMapping } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UI5TableProps {
  fields: FieldMapping[];
  data: Record<string, any>[];
  className?: string;
}

export function UI5Table({ fields, data, className }: UI5TableProps) {
  if (fields.length === 0 || data.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center h-64 border border-sap-border rounded bg-sap-gray",
          className,
        )}
      >
        <p className="text-muted-foreground">No data to display</p>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full overflow-auto border border-sap-border rounded-lg shadow-sm bg-white",
        className,
      )}
    >
      {/* Table Toolbar */}
      <div className="bg-sap-gray border-b border-sap-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-sap-shell">
            Report Preview
          </span>
          <span className="text-xs text-muted-foreground">
            ({data.length} items)
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-sap-gray border-b-2 border-sap-blue">
              {fields.map((field, index) => (
                <th
                  key={index}
                  className="px-4 py-3 text-left text-xs font-semibold text-sap-shell uppercase tracking-wider border-r border-sap-border last:border-r-0"
                >
                  <div className="flex items-center gap-2">
                    <span>{field.displayName}</span>
                  </div>
                  <div className="text-[10px] font-normal text-muted-foreground normal-case mt-1">
                    {field.cdsView}.{field.cdsField}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-sap-border hover:bg-blue-50 transition-colors cursor-pointer"
              >
                {fields.map((field, colIndex) => (
                  <td
                    key={colIndex}
                    className="px-4 py-3 text-sm text-gray-700 border-r border-sap-border last:border-r-0"
                  >
                    {formatCellValue(row[field.displayName], field.type)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="bg-sap-gray border-t border-sap-border px-4 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Total: {data.length} records</span>
          <span>Page 1 of 1</span>
        </div>
      </div>
    </div>
  );
}

function formatCellValue(value: any, type: string): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground">-</span>;
  }

  switch (type) {
    case "number":
      return typeof value === "number" ? value.toLocaleString() : value;

    case "date":
      return new Date(value).toLocaleDateString();

    case "boolean":
      return (
        <span
          className={cn(
            "px-2 py-1 rounded text-xs font-medium",
            value ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800",
          )}
        >
          {value ? "Yes" : "No"}
        </span>
      );

    case "enum":
      const statusColors: Record<string, string> = {
        Open: "bg-blue-100 text-blue-800",
        "In Progress": "bg-yellow-100 text-yellow-800",
        Completed: "bg-green-100 text-green-800",
        Cancelled: "bg-red-100 text-red-800",
        "On Hold": "bg-gray-100 text-gray-800",
        High: "bg-red-100 text-red-800",
        Medium: "bg-yellow-100 text-yellow-800",
        Low: "bg-green-100 text-green-800",
        Critical: "bg-purple-100 text-purple-800",
      };

      const colorClass =
        statusColors[String(value)] || "bg-gray-100 text-gray-800";

      return (
        <span
          className={cn("px-2 py-1 rounded text-xs font-medium", colorClass)}
        >
          {String(value)}
        </span>
      );

    default:
      return String(value);
  }
}
