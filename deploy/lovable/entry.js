// Entrada para o Lovable Cloud (Supabase Edge Function, Deno). Gerado em arquivo único por scripts/build-lovable.js.
import { handle } from '../strategist-proxy.js';

Deno.serve((req) => handle(req, {
  ANTHROPIC_API_KEY: Deno.env.get('ANTHROPIC_API_KEY'),
  PM_ALLOWED_ORIGINS: Deno.env.get('PM_ALLOWED_ORIGINS') ?? '',
  PM_STRATEGIST_LIMIT: Deno.env.get('PM_STRATEGIST_LIMIT') ?? '20',
  PM_STRATEGIST_MODEL: Deno.env.get('PM_STRATEGIST_MODEL') ?? '',
}));
