// Ponto de entrada da versão "arquivo único": expõe o motor para a página.
import { buildDb } from './db-core.js';
import { analyze } from './engine.js';
import { toJson } from './serialize.js';
import { prepareStrategy, verifyStrategy } from './strategist.js';
globalThis.PokeMatch = { buildDb, analyze, toJson, prepareStrategy, verifyStrategy };
