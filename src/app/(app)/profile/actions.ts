'use server'

import { requireRole, AccessDeniedError } from '@/lib/auth/require-role'
import type { AuthProfile, ActionResult } from '@/types'

// ---------------------------------------------------------------------------
// getProfile — fetch current user profile for client components
// ---------------------------------------------------------------------------

export async function getProfile(): Promise<ActionResult<AuthProfile>> {
  try {
    const profile = await requireRole(['employee', 'admin', 'super_admin'])
    return { success: true, data: profile }
  } catch (error) {
    if (error instanceof AccessDeniedError) {
      return { success: false, error: error.message, code: error.code }
    }
    console.error('[getProfile] Error:', error)
    return {
      success: false,
      error:
        error instanceof Error ? error.message : 'An unexpected error occurred',
    }
  }
}
