import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const expectedStudiesKvId = "0ac10be016ec4be29bee244a8d7cea2c";

function readConfig(relativePath) {
  const absolutePath = fileURLToPath(
    new URL(relativePath, new URL("../", import.meta.url)),
  );
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
  const frontendBindings = normalizeKvBindings(
    readConfig("frontend/wrangler.jsonc"),
  );
  const studiesBinding = rootBindings.find(
    ({ binding }) => binding === "STUDIES_KV",
  );

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

  console.log(
    `Configuração Cloudflare válida: ${rootBindings.length} binding(s) KV sincronizado(s).`,
  );
} catch (error) {
  console.error(`Erro de configuração Cloudflare: ${error.message}`);
  process.exitCode = 1;
}
