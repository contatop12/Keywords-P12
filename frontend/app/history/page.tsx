"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listStudies, deleteStudy, StudyIndexEntry } from "../../lib/api";

const PT_MONTHS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const mon = PT_MONTHS[d.getMonth()];
  const yr = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${mon} ${yr} · ${hh}:${mm}`;
}

function pad(n: number, size = 3): string {
  return String(n).padStart(size, "0");
}

export default function HistoryPage() {
  const [studies, setStudies] = useState<StudyIndexEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listStudies()
      .then(setStudies)
      .catch((e) => setError(e instanceof Error ? e.message : "Erro ao carregar histórico."))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Excluir este estudo do histórico?")) return;
    setDeletingId(id);
    try {
      await deleteStudy(id);
      setStudies((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError("Erro ao excluir estudo.");
    } finally {
      setDeletingId(null);
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
          <span>histórico</span>
        </div>
      </header>

      <section className="hero">
        <div className="crumb mono">
          <span className="slash">/</span>
          <span>automações</span>
          <span className="slash">/</span>
          <span>keywords-p12</span>
          <span className="slash">/</span>
          <span className="here">histórico</span>
        </div>
        <h1 className="hero-title display">
          Histórico de Estudos
          <br />
          <span className="dim">Multi-Aba Google Ads.</span>
        </h1>
        <p className="hero-sub">
          Todos os estudos gerados pela equipe. Clique em Reabrir para editar seeds e gerar novo estudo.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label mono">Estudos</div>
            <div className="hero-stat-value mono">
              <span className="accent">{pad(studies.length)}</span>
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label mono">Keywords total</div>
            <div className="hero-stat-value mono">
              <span className="accent">
                {pad(studies.reduce((acc, s) => acc + s.keyword_count, 0), 6)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="status error mono">{error}</div>
      )}

      {loading && (
        <div className="status info mono">Carregando histórico…</div>
      )}

      {!loading && studies.length === 0 && !error && (
        <div className="status info mono">
          Nenhum estudo salvo ainda. Gere um estudo em{" "}
          <Link href="/multi" style={{ color: "var(--accent)" }}>/multi</Link>{" "}
          para aparecer aqui.
        </div>
      )}

      {studies.length > 0 && (
        <div className="panel" style={{ display: "flex", flexDirection: "column", gap: 0, padding: 0, overflow: "hidden" }}>
          {studies.map((s, i) => (
            <div
              key={s.id}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "8px 20px",
                alignItems: "center",
                padding: "16px 20px",
                borderBottom: i < studies.length - 1 ? "1px solid var(--border)" : "none",
              }}
            >
              {/* Info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontWeight: 700, color: "var(--text)", fontSize: "0.95rem" }}>
                    {s.client_name || "—"}
                  </span>
                  {s.brief_preview && (
                    <span className="mono" style={{ fontSize: "0.75rem", color: "var(--text-dim)" }}>
                      {s.brief_preview}
                    </span>
                  )}
                </div>
                <div className="mono" style={{ fontSize: "0.72rem", color: "var(--text-faint)", display: "flex", gap: 16, flexWrap: "wrap" }}>
                  <span>{formatDate(s.created_at)}</span>
                  <span><span className="accent">{s.tab_count}</span> abas</span>
                  <span><span className="accent">{s.keyword_count.toLocaleString("pt-BR")}</span> keywords</span>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <Link
                  href={`/multi?load=${s.id}`}
                  className="btn-primary mono"
                  style={{ fontSize: "0.72rem", padding: "5px 14px", whiteSpace: "nowrap" }}
                >
                  Reabrir →
                </Link>
                <button
                  className="btn-secondary mono"
                  style={{ fontSize: "0.72rem", padding: "5px 12px", color: "var(--text-dim)", whiteSpace: "nowrap" }}
                  onClick={() => handleDelete(s.id)}
                  disabled={deletingId === s.id}
                >
                  {deletingId === s.id ? "…" : "Excluir"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <footer className="foot mono">
        <span>© P12 Digital · uso interno</span>
        <span>keywords-p12 · histórico</span>
      </footer>
    </div>
  );
}
