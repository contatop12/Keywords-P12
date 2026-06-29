# Persistent Cloudflare STUDIES_KV Binding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure every root-level Cloudflare deployment includes the existing `STUDIES_KV` binding and fails before build if the root and frontend KV configurations drift.

**Architecture:** Keep both Wrangler files because root deployments and frontend-local OpenNext commands resolve different paths. Add one dependency-free Node validation script that treats the known namespace ID as an invariant, compares all KV bindings in both configs, and runs before the root Cloudflare build.

**Tech Stack:** Node.js ESM, npm scripts, Wrangler 4, OpenNext for Cloudflare, JSON/JSONC configuration files.

## Global Constraints

- Reuse namespace `0ac10be016ec4be29bee244a8d7cea2c`; do not create or delete remote resources.
- Keep `wrangler.jsonc` at the repository root as the production deployment configuration.
- Keep `frontend/wrangler.jsonc` for frontend-local OpenNext commands.
- Do not migrate KV data to D1 or change stored keys and values.

---

### Task 1: Add a deterministic KV configuration guard

**Files:**
- Create: `scripts/validate-cloudflare-config.mjs`
- Modify: `wrangler.jsonc`
- Modify: `package.json`

**Interfaces:**
- Consumes: `kv_namespaces` arrays from `wrangler.jsonc` and `frontend/wrangler.jsonc`.
- Produces: process exit code `0` when both configs contain identical KV bindings and the expected `STUDIES_KV` ID; process exit code `1` with a direct diagnostic otherwise.

- [ ] **Step 1: Create the validation script while the production config is still broken**

```javascript
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const expectedStudiesKvId = "0ac10be016ec4be29bee244a8d7cea2c";

function readConfig(relativePath) {
  const absolutePath = fileURLToPath(new URL(relativePath, new URL("../", import.meta.url)));
  try {
    return JSON.parse(readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(`Não foi possível ler ${relativePath}: ${error.message}`);
  }
}

function normalizeKvBindings(config) {
  return (config.kv_namespaces ?? [])
    .map(({ binding, id }) => ({ binding, id }))
    .sort((left, right) => left.binding.localeCompare(right.binding));
}

try {
  const rootBindings = normalizeKvBindings(readConfig("wrangler.jsonc"));
  const frontendBindings = normalizeKvBindings(readConfig("frontend/wrangler.jsonc"));
  const studiesBinding = rootBindings.find(({ binding }) => binding === "STUDIES_KV");

  if (studiesBinding?.id !== expectedStudiesKvId) {
    throw new Error(
      `wrangler.jsonc deve declarar STUDIES_KV com id ${expectedStudiesKvId}.`,
    );
  }

  if (JSON.stringify(rootBindings) !== JSON.stringify(frontendBindings)) {
    throw new Error(
      `Bindings KV divergentes. raiz=${JSON.stringify(rootBindings)} frontend=${JSON.stringify(frontendBindings)}`,
    );
  }

  console.log(`Configuração Cloudflare válida: ${rootBindings.length} binding(s) KV sincronizado(s).`);
} catch (error) {
  console.error(`Erro de configuração Cloudflare: ${error.message}`);
  process.exitCode = 1;
}
```

- [ ] **Step 2: Run the guard and verify the regression is reproduced**

Run: `node scripts/validate-cloudflare-config.mjs`

Expected: exit code `1` and `wrangler.jsonc deve declarar STUDIES_KV com id 0ac10be016ec4be29bee244a8d7cea2c.`

- [ ] **Step 3: Add the missing binding to the root Wrangler config**

Add after `services` and before `d1_databases` in `wrangler.jsonc`:

```json
"kv_namespaces": [
  {
    "binding": "STUDIES_KV",
    "id": "0ac10be016ec4be29bee244a8d7cea2c"
  }
],
```

- [ ] **Step 4: Run the guard and verify it passes**

Run: `node scripts/validate-cloudflare-config.mjs`

Expected: exit code `0` and `Configuração Cloudflare válida: 1 binding(s) KV sincronizado(s).`

- [ ] **Step 5: Wire the guard into the root build**

Add to root `package.json` scripts:

```json
"cloudflare:config:check": "node scripts/validate-cloudflare-config.mjs"
```

Change the build entry to:

```json
"frontend:build": "npm run cloudflare:config:check && npm run frontend:install && npm --prefix frontend run cf:build"
```

- [ ] **Step 6: Verify the script hook**

Run: `npm run cloudflare:config:check`

Expected: exit code `0` and `Configuração Cloudflare válida: 1 binding(s) KV sincronizado(s).`

- [ ] **Step 7: Commit the configuration guard**

```bash
git add scripts/validate-cloudflare-config.mjs wrangler.jsonc package.json
git commit -m "fix(cloudflare): persist studies KV binding"
```

### Task 2: Verify application and deployment artifacts

**Files:**
- Verify: `frontend/lib/server/kv.ts`
- Verify: `frontend/app/api/studies/route.ts`
- Verify: `frontend/app/api/structures/route.ts`
- Verify generated artifact: `frontend/.open-next/worker.js`

**Interfaces:**
- Consumes: the `STUDIES_KV` binding published from root `wrangler.jsonc`.
- Produces: a build and Wrangler dry-run whose binding summary includes `STUDIES_KV` as a KV namespace.

- [ ] **Step 1: Run the existing frontend tests**

Run: `npm --prefix frontend test`

Expected: all Vitest suites pass with zero failures.

- [ ] **Step 2: Build through the same root script used by Cloudflare**

Run: `npm run build`

Expected: configuration guard passes, dependencies install successfully, and OpenNext exits with code `0` after generating `frontend/.open-next/worker.js`.

- [ ] **Step 3: Validate the production configuration with Wrangler without publishing**

Run from the repository root: `frontend/node_modules/.bin/wrangler deploy --dry-run --config wrangler.jsonc`

Expected: exit code `0`; the binding summary contains `env.STUDIES_KV` pointing to KV namespace `0ac10be016ec4be29bee244a8d7cea2c`.

- [ ] **Step 4: Inspect the final diff and repository status**

Run: `git diff --check`

Expected: exit code `0` and no whitespace errors.

Run: `git status --short`

Expected: no uncommitted implementation files; generated OpenNext artifacts remain ignored.
