import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client for API routes
 * Uses non-VITE prefixed env vars (server-side only)
 */
export function getSupabaseClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing Supabase environment variables. Set SUPABASE_URL and SUPABASE_SERVICE_KEY.'
    )
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

/**
 * Standard CORS headers for API responses
 */
export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

/**
 * Handle CORS preflight requests
 */
export function handleCors(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }
  return null
}

/**
 * Create a JSON response with CORS headers
 */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  })
}

/**
 * Create an error response with CORS headers
 */
export function errorResponse(message: string, status = 500): Response {
  return jsonResponse({ error: message }, status)
}
