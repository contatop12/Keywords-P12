"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listStructures, deleteStructure } from "../../lib/api";
import { StructureIndexEntry } from "../../lib/types";

const PT_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")} ${PT_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

function pad(n: number, size = 3): string {
  return String(n).padStart(size, "0");
}

function statusColor(status: string): { bg: string; fg: string } {
  if (status === "ativo") return { bg: "rgba(46,196,122,0.16)", fg: "#3fd089" };
  return { bg: "rgba(232,193,60,0.16)", fg: "#e8c13c" }; // rascunho
}

export default function StructuresPage() {
  const [items, setItems] = useState<StructureIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStructures()
      .then(setItems)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar estruturas."))
      .finally(() => setLoading(false));
  }, []);

  async function onDelete(id: string) {
    if (!confirm("Excluir esta estrutura?")) return;
    try {
      await deleteStructure(id);
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError("Erro ao excluir estrutura.");
    }
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
          <span>estruturas</span>
          <span className="brand-divider">·</span>
          <Link href="/clients" style={{ color: "var(--accent)" }}>clientes</Link>
        </div>
      </header>

      <section className="hero">
        <div className="crumb mono">
          <span className="slash">/</span>
          <span>automações</span>
          <span className="slash">/</span>
          <span>keywords-p12</span>
          <span className="slash">/</span>
          <span className="here">estruturas</span>
        </div>
        <h1 className="hero-title display">
          Estruturas de Campanha
          <br />
          <span className="dim">Dashboard de painéis.</span>
        </h1>
        <p className="hero-sub">
          Cada estrutura criada pelo Criador vira um painel editável. Subir/sincronizar com o
          Google Ads chega na Fase 2.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label mono">Estruturas</div>
            <div className="hero-stat-value mono">
              <span className="accent">{pad(items.length, 2)}</span>
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label mono">Keywords total</div>
            <div className="hero-stat-value mono">
              <span className="accent">{pad(items.reduce((a, s) => a + s.keywords_count, 0), 5)}</span>
            </div>
          </div>
        </div>
      </section>

      {error && <div className="status error mono">{error}</div>}
      {loading && <div className="status info mono">Carregando estruturas…</div>}

      {!loading && items.length === 0 && !error && (
        <div className="status info mono">
          Nenhuma estrutura ainda. Avalie um estudo em{" "}
          <Link href="/multi" style={{ color: "var(--accent)" }}>/multi</Link> e clique em Montar estrutura.
        </div>
      )}

      {items.length > 0 && (
        <div className="panel" style={{ padding: 0, overflow: "hidden" }}>
          {items.map((s, i) => {
            const sc = statusColor(s.status);
            return (
              <div
                key={s.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: "8px 20px",
                  alignItems: "center",
                  padding: "16px 20px",
                  borderBottom: i < items.length - 1 ? "1px solid var(--border)" : "none",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                    <span className="mono" style={{ fontWeight: 700, color: "var(--text)" }}>
                      {s.client_name || "—"}
                    </span>
                    <span
                      className="mono"
                      style={{
                        fontSize: "0.66rem",
                        padding: "2px 8px",
                        borderRadius: 4,
                        background: sc.bg,
                        color: sc.fg,
                        textTransform: "uppercase",
                      }}
                    >
                      {s.status}
                    </span>
                    <span className="mono" style={{ fontSize: "0.72rem", color: "var(--text-dim)" }}>
                      {s.objetivo}
                    </span>
                  </div>
                  <div className="mono" style={{ fontSize: "0.72rem", color: "var(--text-faint)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                    <span>{formatDate(s.created_at)}</span>
                    <span><span className="accent">{s.grupos_count}</span> grupos</span>
                    <span><span className="accent">{s.keywords_count}</span> keywords</span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                  <Link
                    href={`/structures/${s.id}`}
                    className="btn-primary mono"
                    style={{ fontSize: "0.72rem", padding: "5px 14px", whiteSpace: "nowrap" }}
                  >
                    Abrir painel →
                  </Link>
                  <button
                    className="btn-secondary mono"
                    style={{ fontSize: "0.72rem", padding: "5px 12px", color: "var(--text-dim)" }}
                    onClick={() => onDelete(s.id)}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <footer className="foot mono">
        <span>© P12 Digital · uso interno</span>
        <span>keywords-p12 · estruturas</span>
      </footer>
    </div>
  );
}
