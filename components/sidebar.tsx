"use client";

import { useState } from "react";
import {
  FileText,
  Home,
  LayoutDashboard,
  Settings,
  HelpCircle,
  Archive,
  FolderOpen,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface SidebarProps {
  className?: string;
}

interface NavItem {
  title: string;
  icon: React.ElementType;
  href?: string;
  badge?: string;
  active?: boolean;
  children?: NavItem[];
}

export function Sidebar({ className }: SidebarProps) {
  const [expandedItems, setExpandedItems] = useState<string[]>(["reports"]);

  const toggleExpand = (title: string) => {
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((item) => item !== title)
        : [...prev, title],
    );
  };

  const navItems: NavItem[] = [
    {
      title: "Home",
      icon: Home,
      href: "/",
      active: false,
    },
    {
      title: "Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
      active: false,
    },
    {
      title: "Reports",
      icon: FileText,
      active: true,
      children: [
        {
          title: "Generate Report",
          icon: Sparkles,
          href: "/",
          active: true,
          badge: "AI",
        },
        {
          title: "My Reports",
          icon: FolderOpen,
          href: "/my-reports",
          badge: "5",
        },
        {
          title: "Templates",
          icon: Archive,
          href: "/templates",
        },
      ],
    },
    {
      title: "Settings",
      icon: Settings,
      href: "/settings",
    },
    {
      title: "Help & Support",
      icon: HelpCircle,
      href: "/help",
    },
  ];

  return (
    <div
      className={cn(
        "h-full flex flex-col bg-white border-r border-gray-200",
        className,
      )}
    >
      {/* Sidebar Header - matches header height exactly */}
      <div className="h-16 px-4 border-b border-gray-200 flex items-center shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-linear-to-br from-sap-blue to-blue-600 flex items-center justify-center shrink-0">
            <FileText className="h-4 w-4 text-white" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-sm text-sap-text truncate">
              SAP Reports
            </h2>
            <p className="text-[10px] text-sap-text-light truncate">
              Workspace
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-0.5">
          {navItems.map((item) => (
            <div key={item.title}>
              {item.children ? (
                <>
                  <Button
                    variant="ghost"
                    className={cn(
                      "w-full justify-start gap-2 h-9 px-3 text-sm font-normal",
                      item.active
                        ? "text-sap-text font-medium"
                        : "text-sap-text-light hover:text-sap-text hover:bg-gray-50",
                    )}
                    onClick={() => toggleExpand(item.title)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left truncate">
                      {item.title}
                    </span>
                    {expandedItems.includes(item.title) ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                  </Button>
                  {expandedItems.includes(item.title) && (
                    <div className="ml-6 mt-0.5 space-y-0.5">
                      {item.children.map((child) => (
                        <Button
                          key={child.title}
                          variant="ghost"
                          className={cn(
                            "w-full justify-start gap-2 h-8 px-3 text-sm font-normal",
                            child.active
                              ? "bg-sap-blue-light text-sap-blue font-medium hover:bg-sap-blue-light"
                              : "text-sap-text-light hover:text-sap-text hover:bg-gray-50",
                          )}
                        >
                          <child.icon className="h-3.5 w-3.5 shrink-0" />
                          <span className="flex-1 text-left truncate">
                            {child.title}
                          </span>
                          {child.badge && (
                            <Badge
                              variant="secondary"
                              className={cn(
                                "h-4 px-1.5 text-[9px] font-semibold shrink-0",
                                child.badge === "AI"
                                  ? "bg-linear-to-r from-purple-500 to-pink-500 text-white border-0"
                                  : "bg-gray-100 text-gray-700 border-0",
                              )}
                            >
                              {child.badge}
                            </Badge>
                          )}
                        </Button>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <Button
                  variant="ghost"
                  className={cn(
                    "w-full justify-start gap-2 h-9 px-3 text-sm font-normal",
                    item.active
                      ? "bg-sap-blue-light text-sap-blue font-medium hover:bg-sap-blue-light"
                      : "text-sap-text-light hover:text-sap-text hover:bg-gray-50",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 text-left truncate">
                    {item.title}
                  </span>
                  {item.badge && (
                    <Badge
                      variant="secondary"
                      className="h-4 px-1.5 text-[9px] shrink-0"
                    >
                      {item.badge}
                    </Badge>
                  )}
                </Button>
              )}
            </div>
          ))}
        </div>
      </nav>

      {/* Divider */}
      <Separator className="bg-gray-200" />

      {/* Sidebar Footer - AI Credits */}
      <div className="p-3 shrink-0">
        <div className="flex items-start gap-2 p-3 rounded-lg bg-linear-to-br from-gray-50 to-gray-100 border border-gray-200">
          <div className="h-7 w-7 rounded-md bg-linear-to-br from-purple-500 to-pink-500 flex items-center justify-center shrink-0">
            <Sparkles className="h-3.5 w-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-xs text-sap-text mb-0.5">
              AI Credits
            </h3>
            <p className="text-[10px] text-sap-text-light mb-2">
              You have{" "}
              <span className="font-semibold text-sap-text">47 credits</span>{" "}
              remaining
            </p>
            <Button
              size="sm"
              className="w-full h-7 text-xs bg-sap-blue hover:bg-sap-blue-dark text-white"
            >
              Upgrade Plan
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
