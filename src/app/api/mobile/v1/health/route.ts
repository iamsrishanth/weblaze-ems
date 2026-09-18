import {
  createRequestId,
  jsonSuccess,
} from "@/lib/mobile/api"

export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  return jsonSuccess(
    {
      status: "ok",
    },
    createRequestId(),
  )
}
