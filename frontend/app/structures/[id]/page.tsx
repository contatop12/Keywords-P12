"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { getStructure, updateStructure } from "../../../lib/api";
import {
  Structure,
  StructureGroup,
  StructureKeyword,
  Correspondencia,
  Sitelink,
  SnippetEstruturado,
  PriceItem,
} from "../../../lib/types";

const ESTRATEGIAS = [
  "maximizar_conversoes",
  "maximizar_valor_conversao",
  "cpa_desejado",
  "roas_desejado",
  "maximizar_cliques",
  "cpc_manual",
];

const CORRESP: Correspondencia[] = ["ampla", "frase", "exata"];

function linesToArr(raw: string): string[] {
  return raw.split("\n").map((s) => s.trim()).filter(Boolean);
}

const SYNC_TOOLTIP = "Disponível na Fase 2 (subir/sincronizar com o Google Ads).";

export default function StructurePanel() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const [s, setS] = useState<Structure | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    getStructure(id)
      .then((data) => {
        if (!data) setError("Estrutura não encontrada.");
        else setS(data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar estrutura."))
      .finally(() => setLoading(false));
  }, [id]);

  function patch(p: Partial<Structure>) {
    setS((prev) => (prev ? { ...prev, ...p } : prev));
  }
  function patchCampanha(p: Partial<Structure["campanha"]>) {
    setS((prev) => (prev ? { ...prev, campanha: { ...prev.campanha, ...p } } : prev));
  }
  function patchRecursos(p: Partial<Structure["recursos"]>) {
    setS((prev) => (prev ? { ...prev, recursos: { ...prev.recursos, ...p } } : prev));
  }
  function patchGroup(idx: number, p: Partial<StructureGroup>) {
    setS((prev) =>
      prev ? { ...prev, grupos: prev.grupos.map((g, i) => (i === idx ? { ...g, ...p } : g)) } : prev
    );
  }
  function patchKeyword(gIdx: number, kIdx: number, p: Partial<StructureKeyword>) {
    setS((prev) =>
      prev
        ? {
            ...prev,
            grupos: prev.grupos.map((g, i) =>
              i === gIdx
                ? { ...g, keywords: g.keywords.map((k, j) => (j === kIdx ? { ...k, ...p } : k)) }
                : g
            ),
          }
        : prev
    );
  }
  function removeKeyword(gIdx: number, kIdx: number) {
    setS((prev) =>
      prev
        ? {
            ...prev,
            grupos: prev.grupos.map((g, i) =>
              i === gIdx ? { ...g, keywords: g.keywords.filter((_, j) => j !== kIdx) } : g
            ),
          }
        : prev
    );
  }
  function addKeyword(gIdx: number) {
    setS((prev) =>
      prev
        ? {
            ...prev,
            grupos: prev.grupos.map((g, i) =>
              i === gIdx
                ? { ...g, keywords: [...g.keywords, { texto: "", correspondencia: "frase" as Correspondencia }] }
                : g
            ),
          }
        : prev
    );
  }
  function removeGroup(gIdx: number) {
    setS((prev) => (prev ? { ...prev, grupos: prev.grupos.filter((_, i) => i !== gIdx) } : prev));
  }

  async function onSave() {
    if (!s) return;
    setSaving(true);
    setError(null);
    setStatus(null);
    try {
      await updateStructure(id, s);
      setStatus("Estrutura salva.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar estrutura.");
    } finally {
      setSaving(false);
    }
  }

  function SyncButton({ label }: { label: string }) {
    return (
      <button type="button" className="btn-secondary mono" disabled title={SYNC_TOOLTIP} style={{ opacity: 0.5, cursor: "not-allowed" }}>
        {label}
      </button>
    );
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>P12 / Keywords</span>
        </div>
        <div className="topbar-meta">
          <Link href="/structures" style={{ color: "var(--text-dim)" }}>← Estruturas</Link>
          <span className="brand-divider">·</span>
          <span>painel</span>
        </div>
      </header>

      {error && <div className="status error mono">{error}</div>}
      {status && <div className="status info mono">{status}</div>}
      {loading && <div className="status info mono">Carregando estrutura…</div>}

      {s && (
        <>
          <section className="hero" style={{ paddingBottom: 12 }}>
            <div className="crumb mono">
              <span className="slash">/</span>
              <span>estruturas</span>
              <span className="slash">/</span>
              <span className="here">{s.campanha.nome || "painel"}</span>
            </div>
            <h1 className="hero-title display" style={{ fontSize: "2rem" }}>
              {s.client_name || "Estrutura"}{" "}
              <span className="dim" style={{ fontSize: "1rem" }}>
                · {s.objetivo} · {s.status}
              </span>
            </h1>
          </section>

          {/* Controles */}
          <div className="panel" style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <button type="button" className={`btn-primary ${saving ? "is-loading" : ""}`} onClick={onSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
            <span className="brand-divider">·</span>
            <SyncButton label="Sincronizar" />
            <SyncButton label="Dessincronizar" />
            <SyncButton label="Pausar" />
            <SyncButton label="Ativar" />
            <span className="mono" style={{ fontSize: 11, color: "var(--text-faint)" }}>{SYNC_TOOLTIP}</span>
          </div>

          {s.avisos?.length > 0 && (
            <div className="status info mono" style={{ whiteSpace: "pre-wrap" }}>
              <strong>Avisos de validação:</strong>
              {"\n"}
              {s.avisos.join("\n")}
            </div>
          )}

          {/* Campanha */}
          <div className="panel search search-google" style={{ marginTop: 24 }}>
            <span className="panel-label mono"><span className="accent">●</span> campanha</span>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Nome da campanha</label>
              <input value={s.campanha.nome} onChange={(e) => patchCampanha({ nome: e.target.value })} />
            </div>
            <div className="field">
              <label>Orçamento diário (R$)</label>
              <input type="number" value={s.campanha.orcamento_diario} onChange={(e) => patchCampanha({ orcamento_diario: Number.parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="field">
              <label>Estratégia de lance</label>
              <select value={s.campanha.estrategia_lance} onChange={(e) => patchCampanha({ estrategia_lance: e.target.value })}>
                {ESTRATEGIAS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Agendamento</label>
              <input value={s.campanha.agendamento} onChange={(e) => patchCampanha({ agendamento: e.target.value })} />
            </div>
            <div className="field">
              <label>Idiomas (um por linha)</label>
              <textarea rows={2} value={s.campanha.idiomas.join("\n")} onChange={(e) => patchCampanha({ idiomas: linesToArr(e.target.value) })} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Locais (um por linha)</label>
              <textarea rows={2} value={s.campanha.locais.join("\n")} onChange={(e) => patchCampanha({ locais: linesToArr(e.target.value) })} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Ações de conversão (uma por linha)</label>
              <textarea rows={2} value={s.campanha.conversoes.join("\n")} onChange={(e) => patchCampanha({ conversoes: linesToArr(e.target.value) })} />
            </div>
          </div>

          {/* Grupos */}
          {s.grupos.map((g, gIdx) => (
            <div className="panel search search-google" key={gIdx} style={{ marginTop: 24 }}>
              <span className="panel-label mono">
                <span className="accent">●</span> grupo {gIdx + 1}
                <button type="button" className="btn-ghost mono" style={{ float: "right" }} onClick={() => removeGroup(gIdx)}>
                  Remover grupo
                </button>
              </span>
              <div className="field">
                <label>Nome do grupo</label>
                <input value={g.nome} onChange={(e) => patchGroup(gIdx, { nome: e.target.value })} />
              </div>
              <div className="field">
                <label>URL final</label>
                <input value={g.url_final} onChange={(e) => patchGroup(gIdx, { url_final: e.target.value })} />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Títulos do RSA (≤30, até 15) — um por linha</label>
                <textarea rows={4} value={g.anuncio_rsa.titulos.join("\n")} onChange={(e) => patchGroup(gIdx, { anuncio_rsa: { ...g.anuncio_rsa, titulos: linesToArr(e.target.value) } })} />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Descrições do RSA (≤90, até 4) — uma por linha</label>
                <textarea rows={3} value={g.anuncio_rsa.descricoes.join("\n")} onChange={(e) => patchGroup(gIdx, { anuncio_rsa: { ...g.anuncio_rsa, descricoes: linesToArr(e.target.value) } })} />
              </div>
              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Caminhos (≤15, até 2) — um por linha</label>
                <textarea rows={2} value={g.anuncio_rsa.caminhos.join("\n")} onChange={(e) => patchGroup(gIdx, { anuncio_rsa: { ...g.anuncio_rsa, caminhos: linesToArr(e.target.value) } })} />
              </div>

              <div className="field" style={{ gridColumn: "1 / -1" }}>
                <label>Keywords ({g.keywords.length})</label>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {g.keywords.map((k, kIdx) => (
                    <div key={kIdx} style={{ display: "flex", gap: 8 }}>
                      <input style={{ flex: 1 }} value={k.texto} onChange={(e) => patchKeyword(gIdx, kIdx, { texto: e.target.value })} />
                      <select value={k.correspondencia} onChange={(e) => patchKeyword(gIdx, kIdx, { correspondencia: e.target.value as Correspondencia })} style={{ width: 110 }}>
                        {CORRESP.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <button type="button" className="btn-ghost mono" onClick={() => removeKeyword(gIdx, kIdx)}>×</button>
                    </div>
                  ))}
                  <button type="button" className="btn-ghost mono" style={{ alignSelf: "flex-start" }} onClick={() => addKeyword(gIdx)}>
                    + Adicionar keyword
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Negativas */}
          <div className="panel search search-google" style={{ marginTop: 24 }}>
            <span className="panel-label mono"><span className="accent">●</span> negativas da campanha</span>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Palavras negativas (uma por linha)</label>
              <textarea rows={4} value={s.negativas_campanha.join("\n")} onChange={(e) => patch({ negativas_campanha: linesToArr(e.target.value) })} />
            </div>
          </div>

          {/* Recursos */}
          <div className="panel search search-google" style={{ marginTop: 24 }}>
            <span className="panel-label mono"><span className="accent">●</span> recursos</span>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Sitelinks (texto ≤25 · desc ≤35)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {s.recursos.sitelinks.map((sl, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input style={{ flex: 1, minWidth: 120 }} placeholder="Texto" value={sl.texto} onChange={(e) => patchRecursos({ sitelinks: s.recursos.sitelinks.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)) })} />
                    <input style={{ flex: 1, minWidth: 120 }} placeholder="Desc 1" value={sl.desc1} onChange={(e) => patchRecursos({ sitelinks: s.recursos.sitelinks.map((x, j) => (j === i ? { ...x, desc1: e.target.value } : x)) })} />
                    <input style={{ flex: 1, minWidth: 120 }} placeholder="Desc 2" value={sl.desc2} onChange={(e) => patchRecursos({ sitelinks: s.recursos.sitelinks.map((x, j) => (j === i ? { ...x, desc2: e.target.value } : x)) })} />
                    <input style={{ flex: 1, minWidth: 140 }} placeholder="URL" value={sl.url} onChange={(e) => patchRecursos({ sitelinks: s.recursos.sitelinks.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                    <button type="button" className="btn-ghost mono" onClick={() => patchRecursos({ sitelinks: s.recursos.sitelinks.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button type="button" className="btn-ghost mono" style={{ alignSelf: "flex-start" }} onClick={() => patchRecursos({ sitelinks: [...s.recursos.sitelinks, { texto: "", desc1: "", desc2: "", url: s.grupos[0]?.url_final ?? "" } as Sitelink] })}>
                  + Sitelink
                </button>
              </div>
            </div>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Frases de destaque (≤25) — uma por linha</label>
              <textarea rows={3} value={s.recursos.frases_destaque.join("\n")} onChange={(e) => patchRecursos({ frases_destaque: linesToArr(e.target.value) })} />
            </div>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Snippets estruturados (valores ≤25)</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {s.recursos.snippets_estruturados.map((sn, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", flexWrap: "wrap" }}>
                    <input style={{ width: 140 }} placeholder="Tipo" value={sn.tipo} onChange={(e) => patchRecursos({ snippets_estruturados: s.recursos.snippets_estruturados.map((x, j) => (j === i ? { ...x, tipo: e.target.value } : x)) })} />
                    <textarea style={{ flex: 1, minWidth: 200 }} rows={2} placeholder="Valores (um por linha)" value={sn.valores.join("\n")} onChange={(e) => patchRecursos({ snippets_estruturados: s.recursos.snippets_estruturados.map((x, j) => (j === i ? { ...x, valores: linesToArr(e.target.value) } : x)) })} />
                    <button type="button" className="btn-ghost mono" onClick={() => patchRecursos({ snippets_estruturados: s.recursos.snippets_estruturados.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button type="button" className="btn-ghost mono" style={{ alignSelf: "flex-start" }} onClick={() => patchRecursos({ snippets_estruturados: [...s.recursos.snippets_estruturados, { tipo: "Serviços", valores: [] } as SnippetEstruturado] })}>
                  + Snippet
                </button>
              </div>
            </div>

            <div className="field">
              <label>Ligação — telefone</label>
              <input value={s.recursos.ligacao.telefone} onChange={(e) => patchRecursos({ ligacao: { ...s.recursos.ligacao, telefone: e.target.value } })} />
            </div>
            <div className="field">
              <label>Ligação — horário</label>
              <input value={s.recursos.ligacao.horario} onChange={(e) => patchRecursos({ ligacao: { ...s.recursos.ligacao, horario: e.target.value } })} />
            </div>

            <div className="field">
              <label>Lead form — headline (≤30)</label>
              <input maxLength={30} value={s.recursos.lead_form.headline} onChange={(e) => patchRecursos({ lead_form: { ...s.recursos.lead_form, headline: e.target.value } })} />
            </div>
            <div className="field">
              <label>Lead form — empresa (≤25)</label>
              <input maxLength={25} value={s.recursos.lead_form.empresa} onChange={(e) => patchRecursos({ lead_form: { ...s.recursos.lead_form, empresa: e.target.value } })} />
            </div>

            <div className="field">
              <label>Promoção — tipo</label>
              <input value={s.recursos.promocao?.tipo ?? ""} onChange={(e) => patchRecursos({ promocao: { tipo: e.target.value, valor: s.recursos.promocao?.valor ?? 0, texto: s.recursos.promocao?.texto } })} />
            </div>
            <div className="field">
              <label>Promoção — valor (%)</label>
              <input type="number" value={s.recursos.promocao?.valor ?? 0} onChange={(e) => patchRecursos({ promocao: { tipo: s.recursos.promocao?.tipo ?? "desconto_percentual", valor: Number.parseFloat(e.target.value) || 0, texto: s.recursos.promocao?.texto } })} />
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Promoção — texto (≤20)</label>
              <input maxLength={20} value={s.recursos.promocao?.texto ?? ""} onChange={(e) => patchRecursos({ promocao: { tipo: s.recursos.promocao?.tipo ?? "desconto_percentual", valor: s.recursos.promocao?.valor ?? 0, texto: e.target.value } })} />
            </div>

            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>Preços</label>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {s.recursos.precos.map((p, i) => (
                  <div key={i} style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <input style={{ flex: 2, minWidth: 140 }} placeholder="Item" value={p.item} onChange={(e) => patchRecursos({ precos: s.recursos.precos.map((x, j) => (j === i ? { ...x, item: e.target.value } : x)) })} />
                    <input style={{ width: 110 }} type="number" placeholder="A partir de" value={p.a_partir_de} onChange={(e) => patchRecursos({ precos: s.recursos.precos.map((x, j) => (j === i ? { ...x, a_partir_de: Number.parseFloat(e.target.value) || 0 } : x)) })} />
                    <input style={{ width: 70 }} placeholder="BRL" value={p.moeda} onChange={(e) => patchRecursos({ precos: s.recursos.precos.map((x, j) => (j === i ? { ...x, moeda: e.target.value } : x)) })} />
                    <input style={{ flex: 2, minWidth: 140 }} placeholder="URL" value={p.url ?? ""} onChange={(e) => patchRecursos({ precos: s.recursos.precos.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)) })} />
                    <button type="button" className="btn-ghost mono" onClick={() => patchRecursos({ precos: s.recursos.precos.filter((_, j) => j !== i) })}>×</button>
                  </div>
                ))}
                <button type="button" className="btn-ghost mono" style={{ alignSelf: "flex-start" }} onClick={() => patchRecursos({ precos: [...s.recursos.precos, { item: "", a_partir_de: 0, moeda: "BRL", url: "" } as PriceItem] })}>
                  + Preço
                </button>
              </div>
            </div>
          </div>

          <div className="panel" style={{ display: "flex", gap: 8, marginTop: 24 }}>
            <button type="button" className={`btn-primary ${saving ? "is-loading" : ""}`} onClick={onSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </>
      )}

      <footer className="foot mono">
        <span>© P12 Digital · uso interno</span>
        <span>keywords-p12 · painel</span>
      </footer>
    </div>
  );
}
