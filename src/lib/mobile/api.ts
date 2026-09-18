import "server-only"

export const ORGANIZATION_TIMEZONE = "Asia/Kolkata"
export const ORGANIZATION_WORKWEEK = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const

type ErrorFieldErrors = Record<string, string | string[]>

type ResponseMeta = {
  request_id: string
  server_time: string
  org_date: string
}

export class MobileApiError extends Error {
  readonly code: string
  readonly status: number
  readonly field_errors?: ErrorFieldErrors

  constructor(
    code: string,
    message: string,
    status: number,
    fieldErrors?: ErrorFieldErrors,
  ) {
    super(message)
    this.name = "MobileApiError"
    this.code = code
    this.status = status
    this.field_errors = fieldErrors
  }
}

function getOrganizationDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ORGANIZATION_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  )

  return `${values.year}-${values.month}-${values.day}`
}

function getResponseMeta(requestId: string, date: Date): ResponseMeta {
  return {
    request_id: requestId,
    server_time: date.toISOString(),
    org_date: getOrganizationDate(date),
  }
}

const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/json; charset=utf-8",
}

export function createRequestId(): string {
  return crypto.randomUUID()
}

export function jsonSuccess<T>(
  data: T,
  requestId: string,
  status = 200,
  date = new Date(),
): Response {
  return Response.json(
    {
      success: true,
      data,
      meta: getResponseMeta(requestId, date),
    },
    {
      status,
      headers: PRIVATE_NO_STORE_HEADERS,
    },
  )
}

export function jsonError(
  error: MobileApiError,
  requestId: string,
  date = new Date(),
): Response {
  const responseError: {
    code: string
    message: string
    field_errors?: ErrorFieldErrors
  } = {
    code: error.code,
    message: error.message,
  }

  if (error.field_errors) {
    responseError.field_errors = error.field_errors
  }

  return Response.json(
    {
      success: false,
      error: responseError,
      meta: getResponseMeta(requestId, date),
    },
    {
      status: error.status,
      headers: PRIVATE_NO_STORE_HEADERS,
    },
  )
}

export function normalizeMobileError(error: unknown): MobileApiError {
  if (error instanceof MobileApiError) {
    return error
  }

  return new MobileApiError(
    "INTERNAL_ERROR",
    "An unexpected server error occurred.",
    500,
  )
}
