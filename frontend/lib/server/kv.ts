import { getCloudflareContext } from "@opennextjs/cloudflare";

export type KVNamespace = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
};

// Reusa o namespace STUDIES_KV (já provisionado) com prefixos de chave por entidade,
// evitando criar namespaces novos no Cloudflare na Fase 1.
export async function getKV(): Promise<KVNamespace> {
  const ctx = await getCloudflareContext();
  const kv = (ctx.env as unknown as Record<string, unknown>).STUDIES_KV as KVNamespace | undefined;
  if (!kv) throw new Error("STUDIES_KV não configurado.");
  return kv;
}

export async function readIndex<T>(kv: KVNamespace, indexKey: string): Promise<T[]> {
  const raw = await kv.get(indexKey);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

export async function writeIndex<T>(kv: KVNamespace, indexKey: string, items: T[]): Promise<void> {
  await kv.put(indexKey, JSON.stringify(items));
}
