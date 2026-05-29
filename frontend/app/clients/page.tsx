"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  listClients,
  getClient,
  saveClient,
  deleteClient,
} from "../../lib/api";
import { ClientProfile, ClientProfileIndexEntry, PriceItem } from "../../lib/types";

const ESTRATEGIAS: { value: string; label: string }[] = [
  { value: "maximizar_conversoes", label: "Maximizar conversões" },
  { value: "maximizar_valor_conversao", label: "Maximizar valor de conversão" },
  { value: "cpa_desejado", label: "CPA desejado" },
  { value: "roas_desejado", label: "ROAS desejado" },
  { value: "maximizar_cliques", label: "Maximizar cliques" },
  { value: "cpc_manual", label: "CPC manual" },
];

type FormState = {
  id?: string;
  created_at?: string;
  nome_empresa: string;
  urls_finais: string;
  telefone: string;
  endereco: string;
  horario_funcionamento: string;
  locais: string;
  idioma: string;
  marcas: string;
  servicos: string;
  precos: PriceItem[];
  promocao_tipo: string;
  promocao_valor: string;
  promocao_texto: string;
  orcamento_diario: string;
  estrategia_lance: string;
  acoes_conversao: string;
};

function emptyForm(): FormState {
  return {
    nome_empresa: "",
    urls_finais: "",
    telefone: "",
    endereco: "",
    horario_funcionamento: "",
    locais: "",
    idioma: "pt",
    marcas: "",
    servicos: "",
    precos: [],
    promocao_tipo: "",
    promocao_valor: "",
    promocao_texto: "",
    orcamento_diario: "",
    estrategia_lance: "maximizar_conversoes",
    acoes_conversao: "",
  };
}

function splitList(raw: string): string[] {
  return raw
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function profileToForm(p: ClientProfile): FormState {
  return {
    id: p.id,
    created_at: p.created_at,
    nome_empresa: p.nome_empresa,
    urls_finais: p.urls_finais.join("\n"),
    telefone: p.telefone,
    endereco: p.endereco,
    horario_funcionamento: p.horario_funcionamento,
    locais: p.locais.join("\n"),
    idioma: p.idioma,
    marcas: p.marcas.join("\n"),
    servicos: p.servicos.join("\n"),
    precos: p.precos ?? [],
    promocao_tipo: p.promocao?.tipo ?? "",
    promocao_valor: p.promocao ? String(p.promocao.valor) : "",
    promocao_texto: p.promocao?.texto ?? "",
    orcamento_diario: p.orcamento_diario ? String(p.orcamento_diario) : "",
    estrategia_lance: p.estrategia_lance || "maximizar_conversoes",
    acoes_conversao: p.acoes_conversao.join("\n"),
  };
}

function formToProfile(f: FormState): Partial<ClientProfile> {
  const valor = Number.parseFloat(f.promocao_valor);
  const promocao =
    f.promocao_tipo.trim() || Number.isFinite(valor)
      ? {
          tipo: f.promocao_tipo.trim() || "desconto_percentual",
          valor: Number.isFinite(valor) ? valor : 0,
          texto: f.promocao_texto.trim() || undefined,
        }
      : null;
  return {
    id: f.id,
    created_at: f.created_at,
    nome_empresa: f.nome_empresa.trim(),
    urls_finais: splitList(f.urls_finais),
    telefone: f.telefone.trim(),
    endereco: f.endereco.trim(),
    horario_funcionamento: f.horario_funcionamento.trim(),
    locais: splitList(f.locais),
    idioma: f.idioma.trim() || "pt",
    marcas: splitList(f.marcas),
    servicos: splitList(f.servicos),
    precos: f.precos.filter((p) => p.item.trim()),
    promocao,
    orcamento_diario: Number.parseFloat(f.orcamento_diario) || 0,
    estrategia_lance: f.estrategia_lance,
    acoes_conversao: splitList(f.acoes_conversao),
  };
}

export default function ClientsPage() {
  const [list, setList] = useState<ClientProfileIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  function refresh() {
    setLoading(true);
    listClients()
      .then(setList)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar clientes."))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startNew() {
    setForm(emptyForm());
    setEditing(true);
    setStatus(null);
    setError(null);
  }

  async function startEdit(id: string) {
    setError(null);
    setStatus("Carregando perfil…");
    const profile = await getClient(id);
    setStatus(null);
    if (!profile) {
      setError("Perfil não encontrado.");
      return;
    }
    setForm(profileToForm(profile));
    setEditing(true);
  }

  async function onSave() {
    if (!form.nome_empresa.trim()) {
      setError("Informe o nome da empresa.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveClient(formToProfile(form));
      setStatus(`Perfil "${form.nome_empresa}" salvo.`);
      setEditing(false);
      setForm(emptyForm());
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar cliente.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(id: string) {
    if (!confirm("Excluir este perfil de cliente?")) return;
    try {
      await deleteClient(id);
      setList((prev) => prev.filter((c) => c.id !== id));
    } catch {
      setError("Erro ao excluir perfil.");
    }
  }

  function addPreco() {
    set("precos", [...form.precos, { item: "", a_partir_de: 0, moeda: "BRL", url: "" }]);
  }

  function updatePreco(idx: number, patch: Partial<PriceItem>) {
    set(
      "precos",
      form.precos.map((p, i) => (i === idx ? { ...p, ...patch } : p))
    );
  }

  function removePreco(idx: number) {
    set("precos", form.precos.filter((_, i) => i !== idx));
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>P12 / Keywords</span>
        </div>
        <div className="topbar-meta">
          <Link href="/multi" style={{ color: "var(--text-dim)" }}>← Voltar</Link>
          <span className="brand-divider">·</span>
          <span>clientes</span>
        </div>
      </header>

      <section className="hero">
        <div className="crumb mono">
          <span className="slash">/</span>
          <span>automações</span>
          <span className="slash">/</span>
          <span>keywords-p12</span>
          <span className="slash">/</span>
          <span className="here">clientes</span>
        </div>
        <h1 className="hero-title display">
          Perfis de Cliente
          <br />
          <span className="dim">Dados para estrutura de campanha.</span>
        </h1>
        <p className="hero-sub">
          Cadastro reutilizado pelo Criador de Estrutura e pelo envio ao Google Ads (Fase 2).
        </p>
      </section>

      {error && <div className="status error mono">{error}</div>}
      {status && <div className="status info mono">{status}</div>}

      {!editing && (
        <>
          <div style={{ display: "flex", justifyContent: "flex-end", margin: "8px 0 16px" }}>
            <button type="button" className="btn-primary" onClick={startNew}>
              + Novo perfil
            </button>
          </div>

          {loading && <div className="status info mono">Carregando clientes…</div>}

          {!loading && list.length === 0 && (
            <div className="status info mono">Nenhum perfil cadastrado. Crie o primeiro.</div>
          )}

          {list.length > 0 && (
            <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
              {list.map((c, i) => (
                <div
                  key={c.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: "8px 20px",
                    alignItems: "center",
                    padding: "16px 20px",
                    borderBottom: i < list.length - 1 ? "1px solid var(--border)" : "none",
                  }}
                >
                  <span className="mono" style={{ fontWeight: 700, color: "var(--text)" }}>
                    {c.nome_empresa || "—"}
                  </span>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      className="btn-primary mono"
                      style={{ fontSize: "0.72rem", padding: "5px 14px" }}
                      onClick={() => startEdit(c.id)}
                    >
                      Editar
                    </button>
                    <button
                      className="btn-secondary mono"
                      style={{ fontSize: "0.72rem", padding: "5px 12px", color: "var(--text-dim)" }}
                      onClick={() => onDelete(c.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="panel search search-google">
          <span className="panel-label mono">
            <span className="accent">●</span> {form.id ? "editar perfil" : "novo perfil"}
          </span>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">01</span> Nome da empresa</label>
            <input value={form.nome_empresa} onChange={(e) => set("nome_empresa", e.target.value)} placeholder="Ex: Vita Áudio" />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">02</span> URL(s) final(is) — uma por linha</label>
            <textarea value={form.urls_finais} onChange={(e) => set("urls_finais", e.target.value)} rows={2} placeholder={"https://exemplo.com.br"} />
          </div>

          <div className="field">
            <label><span className="idx">03</span> Telefone (com DDD)</label>
            <input value={form.telefone} onChange={(e) => set("telefone", e.target.value)} placeholder="(11) 99999-9999" />
          </div>

          <div className="field">
            <label><span className="idx">04</span> Idioma</label>
            <input value={form.idioma} onChange={(e) => set("idioma", e.target.value)} placeholder="pt" />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">05</span> Endereço</label>
            <input value={form.endereco} onChange={(e) => set("endereco", e.target.value)} placeholder="Rua, número, bairro, cidade - UF" />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">06</span> Horário de funcionamento</label>
            <input value={form.horario_funcionamento} onChange={(e) => set("horario_funcionamento", e.target.value)} placeholder="Seg-Sex 9h-18h" />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">07</span> Locais / geo — um por linha</label>
            <textarea value={form.locais} onChange={(e) => set("locais", e.target.value)} rows={2} placeholder={"São Paulo - SP\nGuarulhos - SP"} />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">08</span> Marcas trabalhadas — uma por linha</label>
            <textarea value={form.marcas} onChange={(e) => set("marcas", e.target.value)} rows={2} placeholder={"Phonak\nOticon"} />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">09</span> Serviços — um por linha</label>
            <textarea value={form.servicos} onChange={(e) => set("servicos", e.target.value)} rows={3} placeholder={"Aparelho auditivo\nExame audiometria"} />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">10</span> Faixas de preço / produtos</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {form.precos.map((p, idx) => (
                <div key={idx} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <input style={{ flex: 2, minWidth: 160 }} value={p.item} onChange={(e) => updatePreco(idx, { item: e.target.value })} placeholder="Item / produto" />
                  <input style={{ flex: 1, minWidth: 100 }} type="number" value={p.a_partir_de} onChange={(e) => updatePreco(idx, { a_partir_de: Number.parseFloat(e.target.value) || 0 })} placeholder="A partir de" />
                  <input style={{ width: 80 }} value={p.moeda} onChange={(e) => updatePreco(idx, { moeda: e.target.value })} placeholder="BRL" />
                  <input style={{ flex: 2, minWidth: 160 }} value={p.url ?? ""} onChange={(e) => updatePreco(idx, { url: e.target.value })} placeholder="URL (opcional)" />
                  <button type="button" className="btn-ghost mono" onClick={() => removePreco(idx)}>×</button>
                </div>
              ))}
              <button type="button" className="btn-ghost mono" onClick={addPreco} style={{ alignSelf: "flex-start" }}>
                + Adicionar preço
              </button>
            </div>
          </div>

          <div className="field">
            <label><span className="idx">11</span> Promoção — tipo</label>
            <input value={form.promocao_tipo} onChange={(e) => set("promocao_tipo", e.target.value)} placeholder="desconto_percentual" />
          </div>
          <div className="field">
            <label><span className="idx">12</span> Promoção — valor (%)</label>
            <input type="number" value={form.promocao_valor} onChange={(e) => set("promocao_valor", e.target.value)} placeholder="20" />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">13</span> Promoção — texto (≤20 chars)</label>
            <input value={form.promocao_texto} onChange={(e) => set("promocao_texto", e.target.value)} maxLength={20} placeholder="20% OFF na 1ª consulta" />
          </div>

          <div className="field">
            <label><span className="idx">14</span> Orçamento diário (R$)</label>
            <input type="number" value={form.orcamento_diario} onChange={(e) => set("orcamento_diario", e.target.value)} placeholder="100" />
          </div>
          <div className="field">
            <label><span className="idx">15</span> Estratégia de lance</label>
            <select value={form.estrategia_lance} onChange={(e) => set("estrategia_lance", e.target.value)}>
              {ESTRATEGIAS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label><span className="idx">16</span> Ações de conversão — uma por linha</label>
            <textarea value={form.acoes_conversao} onChange={(e) => set("acoes_conversao", e.target.value)} rows={2} placeholder={"Agendamento\nLigação\nFormulário"} />
          </div>

          <div className="submit-wrap" style={{ gridColumn: "1 / -1", display: "flex", gap: 12 }}>
            <button type="button" className={`btn-primary ${saving ? "is-loading" : ""}`} onClick={onSave} disabled={saving}>
              {saving ? "Salvando…" : "Salvar perfil"}
            </button>
            <button type="button" className="btn-ghost mono" onClick={() => { setEditing(false); setForm(emptyForm()); }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <footer className="foot mono">
        <span>© P12 Digital · uso interno</span>
        <span>keywords-p12 · clientes</span>
      </footer>
    </div>
  );
}
