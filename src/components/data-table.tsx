import type { ReactNode, ThHTMLAttributes, TdHTMLAttributes } from "react";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Table } from "@/components/ui/table";

/**
 * Consistent table kit — one pattern for every data table in the app
 * (DESIGN.md §4): sticky header, 36px header rows, h-9 body rows, hover
 * highlight, right-aligned mono numerics, 11px uppercase header labels.
 *
 * Usage:
 *   <DataTable>
 *     <TableHeader>
 *       <TableRow className="hover:bg-transparent">
 *         <Th>Employee</Th>
 *         <Th align="right">Hours</Th>
 *         <Th align="right">Status</Th>
 *       </TableRow>
 *     </TableHeader>
 *     <TableBody>
 *       <TableRow>
 *         <Td>…</Td>
 *         <Td numeric align="right">8.2</Td>
 *         <Td align="right"><StatusPill status="present" /></Td>
 *       </TableRow>
 *     </TableBody>
 *   </DataTable>
 */

interface ThProps extends ThHTMLAttributes<HTMLTableCellElement> {
  align?: "left" | "right" | "center";
}

export function Th({ className, align = "left", ...props }: ThProps) {
  return (
    <th
      className={cn(
        "sticky top-0 z-10 h-9 bg-muted px-4 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      {...props}
    />
  );
}

interface TdProps extends TdHTMLAttributes<HTMLTableCellElement> {
  /** Mono, tabular numerals for numeric cells. */
  numeric?: boolean;
  align?: "left" | "right" | "center";
}

export function Td({ className, numeric, align, ...props }: TdProps) {
  return (
    <td
      className={cn(
        "px-4 py-2.5",
        numeric && "numeric",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className
      )}
      {...props}
    />
  );
}

interface DataTableProps {
  children: ReactNode;
  /** Scroll container classes — defaults to a max-height scroll area. */
  containerClassName?: string;
  className?: string;
}

export function DataTable({
  children,
  containerClassName,
  className,
}: DataTableProps) {
  return (
    <Card className="gap-0 py-0">
      <Table
        containerClassName={cn(
          "max-h-[640px] overflow-y-auto",
          containerClassName
        )}
        className={className}
      >
        {children}
      </Table>
    </Card>
  );
}
