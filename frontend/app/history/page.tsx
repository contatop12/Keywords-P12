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
    <div className="root-layout">
      <header className="topbar">
        <div className="topbar-inner mono">
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
          Todos os estudos gerados. Clique em Reabrir para editar seeds e gerar novo estudo.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label mono">Estudos</div>
            <div className="hero-stat-value mono">
              <span className="accent">{String(studies.length).padStart(3, "0")}</span>
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="status error mono" style={{ margin: "0 var(--gap)" }}>
          {error}
        </div>
      )}

      {loading && (
        <div className="status info mono" style={{ margin: "0 var(--gap)" }}>
          Carregando histórico…
        </div>
      )}

      {!loading && studies.length === 0 && !error && (
        <div className="status info mono" style={{ margin: "0 var(--gap)" }}>
          Nenhum estudo salvo ainda. Gere um estudo em{" "}
          <Link href="/multi" style={{ color: "var(--accent)" }}>
            /multi
          </Link>{" "}
          para aparecer aqui.
        </div>
      )}

      {studies.length > 0 && (
        <div style={{ padding: "0 var(--gap)", display: "flex", flexDirection: "column", gap: 12 }}>
          {studies.map((s) => (
            <div
              key={s.id}
              className="panel"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto",
                gap: "12px 24px",
                alignItems: "start",
              }}
            >
              {/* Left: info */}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <span
                    className="mono"
                    style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text)" }}
                  >
                    {s.client_name || "—"}
                  </span>
                  {s.brief_preview && (
                    <span className="mono" style={{ fontSize: "0.78rem", color: "var(--text-dim)" }}>
                      {s.brief_preview}
                    </span>
                  )}
                </div>
                <div
                  className="mono"
                  style={{ fontSize: "0.75rem", color: "var(--text-faint)", display: "flex", gap: 16 }}
                >
                  <span>{formatDate(s.created_at)}</span>
                  <span>
                    <span className="accent">{s.tab_count}</span> abas
                  </span>
                  <span>
                    <span className="accent">{s.keyword_count.toLocaleString("pt-BR")}</span> keywords
                  </span>
                </div>
              </div>

              {/* Right: actions */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                <Link
                  href={`/multi?load=${s.id}`}
                  className="btn-primary mono"
                  style={{ fontSize: "0.75rem", padding: "6px 14px" }}
                >
                  Reabrir →
                </Link>
                <button
                  className="btn-secondary mono"
                  style={{ fontSize: "0.75rem", padding: "6px 12px", color: "var(--text-dim)" }}
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

      <footer className="site-footer mono">
        <span>© P12 Digital · uso interno</span>
        <span>Keywords-P12 · histórico</span>
      </footer>
    </div>
  );
}
