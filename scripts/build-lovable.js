// Gera deploy/lovable/estrategista/index.ts: a função do estrategista em UM arquivo, pronta para colar no Lovable
// (Supabase Edge Function). O SDK da Anthropic vem por "npm:" (o Deno baixa sozinho); o resto vai embutido.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const sdkFromNpm = {
  name: 'sdk-npm',
  setup(b) { b.onResolve({ filter: /^@anthropic-ai\/sdk$/ }, () => ({ path: 'npm:@anthropic-ai/sdk@^1', external: true })); },
};
const out = await build({ entryPoints: ['deploy/lovable/entry.js'], bundle: true, format: 'esm', platform: 'neutral', write: false, plugins: [sdkFromNpm], charset: 'utf8' });
const header = `// PokeMatch — servidor do estrategista (Lovable Cloud / Supabase Edge Function).
// NÃO EDITE À MÃO: gerado por scripts/build-lovable.js a partir de deploy/strategist-proxy.js e src/strategist-core.js.
// Segredo necessário: ANTHROPIC_API_KEY. Opcionais: PM_STRATEGIST_LIMIT (padrão 20 por IP por dia), PM_ALLOWED_ORIGINS.
`;
await mkdir('deploy/lovable/estrategista', { recursive: true });
await writeFile('deploy/lovable/estrategista/index.ts', header + out.outputFiles[0].text);
console.log(`deploy/lovable/estrategista/index.ts pronto (${(out.outputFiles[0].text.length / 1024).toFixed(1)} KB)`);
