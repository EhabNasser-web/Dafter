/**
 * src/core/moduleLoader.js
 * Auto-discovers and registers every folder under src/modules/.
 * Each module may export:
 *   - schema    : Drizzle table definitions
 *   - tools     : Array of agent tool descriptors { name, description, parameters, execute(args, ctx) }
 *   - router    : Express router (mounted at /api/<moduleName>)
 *   - checkin   : async (userId) => string|null  – question for daily check-in
 */

import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MODULES_DIR = join(__dirname, '../modules');

/** @type {Map<string, { tools: any[], router: any, checkin: Function|null }>} */
const registry = new Map();

/**
 * Loads all modules. Call once at startup.
 * @param {import('express').Application} app
 */
export async function loadModules(app) {
  const entries = readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const entry of entries) {
    const name = entry.name;
    const modDir = join(MODULES_DIR, name);
    const mod = {};

    // tools.js
    const toolsPath = join(modDir, 'tools.js');
    if (existsSync(toolsPath)) {
      const { tools } = await import(pathToFileURL(toolsPath).href);
      mod.tools = tools ?? [];
    } else {
      mod.tools = [];
    }

    // router.js
    const routerPath = join(modDir, 'router.js');
    if (existsSync(routerPath)) {
      const { router } = await import(pathToFileURL(routerPath).href);
      if (router && name !== 'chat') {
        app.use(`/api/${name}`, router);
        console.log(`[modules] Mounted /api/${name}`);
      }
      mod.router = router ?? null;
    } else {
      mod.router = null;
    }

    // checkin.js
    const checkinPath = join(modDir, 'checkin.js');
    if (existsSync(checkinPath)) {
      const { checkin } = await import(pathToFileURL(checkinPath).href);
      mod.checkin = checkin ?? null;
    } else {
      mod.checkin = null;
    }

    registry.set(name, mod);
    console.log(`[modules] Registered module: ${name} (${mod.tools.length} tools)`);
  }
}

/** Returns all tools for enabled modules based on user's plan. */
export function getToolsForPlan(plan, plans) {
  const enabledModules = plans[plan]?.enabled_modules ?? [];
  const tools = [];
  for (const modName of enabledModules) {
    const mod = registry.get(modName);
    if (mod) tools.push(...mod.tools);
  }
  return tools;
}

/** Returns the registry (for agent/checkin use). */
export function getRegistry() {
  return registry;
}
