import { headers } from 'next/headers'

// ---------------------------------------------------------------------------
// Client network metadata for attendance auditing.
//
// Written to the database for audit purposes only — never rendered in the UI.
// Every helper here is deliberately total: an unparseable address yields null
// rather than throwing, because a missing log entry must never block a
// check-in or check-out.
// ---------------------------------------------------------------------------

export interface ClientNetwork {
  ip: string | null
  ipVersion: 4 | 6 | null
  userAgent: string | null
}

function stripPort(value: string): string {
  // [2001:db8::1]:443  ->  2001:db8::1
  if (value.startsWith('[')) {
    const match = value.match(/^\[([^\]]+)\]/)
    if (match) return match[1]
  }
  // 203.0.113.7:54321  ->  203.0.113.7   (IPv6 has 2+ colons, IPv4 exactly one)
  const colons = (value.match(/:/g) ?? []).length
  if (colons === 1 && /^[\d.]+:\d+$/.test(value)) {
    return value.split(':')[0]
  }
  return value
}

function isIPv4(value: string): boolean {
  const parts = value.split('.')
  if (parts.length !== 4) return false
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
}

function isIPv6(value: string): boolean {
  // Loose validation — Postgres `inet` is the final arbiter and we fall back
  // to null on rejection anyway.
  return value.includes(':') && /^[0-9a-fA-F:.]+$/.test(value)
}

/**
 * Best-effort client IP from the proxy headers Vercel sets.
 * Prefers x-forwarded-for (first hop = original client), then x-real-ip,
 * then Cloudflare's header.
 */
export async function getClientNetwork(): Promise<ClientNetwork> {
  let ip: string | null = null
  let userAgent: string | null = null

  try {
    const h = await headers()
    userAgent = h.get('user-agent')

    const forwarded = h.get('x-forwarded-for')
    const candidate =
      (forwarded ? forwarded.split(',')[0] : null) ??
      h.get('x-real-ip') ??
      h.get('cf-connecting-ip')

    if (candidate) {
      const cleaned = stripPort(candidate.trim())
      if (isIPv4(cleaned) || isIPv6(cleaned)) ip = cleaned
    }
  } catch {
    // headers() is unavailable outside a request scope — return nulls.
    return { ip: null, ipVersion: null, userAgent: null }
  }

  return {
    ip,
    ipVersion: ip ? (ip.includes(':') ? 6 : 4) : null,
    userAgent,
  }
}
