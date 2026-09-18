import type { MobileUserContext } from "@/lib/mobile/context"
import {
  DbRow,
  EOD_COLUMNS,
  METRICS_COLUMNS,
  TASK_COLUMNS,
  WEEKLY_COLUMNS,
  fetchDepartmentNames,
  fetchUserNames,
  scopedUserIds,
  stringOrNull,
  stringValue,
} from "./index"

export async function getScopedUserIds(
  context: MobileUserContext,
  requestedUserId: string | null,
): Promise<string[]> {
  const ids = await scopedUserIds(context, requestedUserId)
  if (ids === null) {
    const { data, error } = await context.client.from("app_user").select("id")
    if (error) throw error
    return ((data ?? []) as DbRow[]).map((row) => stringValue(row.id)).filter(Boolean)
  }
  return ids
}

export async function taskNames(
  context: MobileUserContext,
  rows: DbRow[],
): Promise<Map<string, { assignee: string | null; assigner: string | null }>> {
  const ids = Array.from(
    new Set(
      rows
        .flatMap((row) => [stringValue(row.assigned_to), stringValue(row.assigned_by)])
        .filter(Boolean),
    ),
  )
  const names = await fetchUserNames(context.client, ids)
  return new Map(
    rows.map((row) => [
      stringValue(row.id),
      {
        assignee: names.get(stringValue(row.assigned_to))?.name ?? null,
        assigner: names.get(stringValue(row.assigned_by))?.name ?? null,
      },
    ]),
  )
}

export async function eodNames(
  context: MobileUserContext,
  rows: DbRow[],
): Promise<Map<string, { user_name: string; department_name: string | null }>> {
  const userIds = Array.from(new Set(rows.map((row) => stringValue(row.user_id)).filter(Boolean)))
  const users = await fetchUserNames(context.client, userIds)
  const departments = await fetchDepartmentNames(
    context.client,
    Array.from(users.values()).map((user) => user.department_id).filter((id): id is string => Boolean(id)),
  )
  return new Map(
    rows.map((row) => {
      const user = users.get(stringValue(row.user_id))
      return [
        stringValue(row.id),
        {
          user_name: user?.name ?? "",
          department_name: user?.department_id ? departments.get(user.department_id) ?? null : null,
        },
      ]
    }),
  )
}

export async function weeklyNames(
  context: MobileUserContext,
  rows: DbRow[],
): Promise<Map<string, { user_name: string; department_name: string | null }>> {
  return eodNames(context, rows)
}

export { EOD_COLUMNS, METRICS_COLUMNS, TASK_COLUMNS, WEEKLY_COLUMNS }

export function selectUserId(row: DbRow): string | null {
  return stringOrNull(row.user_id)
}
