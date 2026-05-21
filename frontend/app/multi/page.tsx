"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";

import {
  generateMultiStudy,
  downloadMultiStudyXlsx,
  exportMultiStudyToSheets,
  runAgebri,
  suggestGoogleLocations,
  MultiStudyResult,
  MultiTabSpec,
} from "../../lib/api";
import { AgebriResult, BriefingData, GeoSuggestionItem } from "../../lib/types";

type GeoType = "country" | "state" | "city";

interface TabDraft {
  id: string;
  name: string;
  seedsInput: string;
  seeds: string[];
}

const MAX_TABS = 30;

const GEO_TYPE_LABELS: Record<GeoType, string> = {
  country: "País",
  state: "Estado",
  city: "Cidade",
};

function makeId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function geoLabel(geo: string): string {
  const [, ...rest] = geo.split(":");
  const base = rest.join(":");
  return base.includes("#") ? base.split("#")[0] : base;
}

function geoValue(type: GeoType, value: string, id?: string): string {
  const map: Record<GeoType, string> = { country: "country", state: "state", city: "city" };
  const normalized = value.toLowerCase();
  return id ? `${map[type]}:${normalized}#${id}` : `${map[type]}:${normalized}`;
}

function splitSeeds(raw: string): string[] {
  return raw
    .split(/[\n;,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pad(n: number, size = 3): string {
  return String(n).padStart(size, "0");
}

const DEFAULT_TABS: TabDraft[] = [
  { id: makeId(), name: "Geral", seedsInput: "", seeds: [] },
];

const DEFAULT_BRIEFING: BriefingData = {
  company_name: "",
  niche: "",
  description: "",
  services: "",
  target_audience: "",
  main_objective: "",
  competitors: "",
  observations: "",
  urls: [""],
  restrict_keywords: "",
};

export default function MultiStudyPage() {
  const [briefing, setBriefing] = useState<BriefingData>(DEFAULT_BRIEFING);
  const [agebriResult, setAgebriResult] = useState<AgebriResult | null>(null);
  const [agebriLoading, setAgebriLoading] = useState(false);
  const [agebriError, setAgebriError] = useState<string | null>(null);

  const [tabs, setTabs] = useState<TabDraft[]>(DEFAULT_TABS);
  const [country, setCountry] = useState("BR");
  const [limit, setLimit] = useState(2000);
  const [geoType, setGeoType] = useState<GeoType>("city");
  const [geoChips, setGeoChips] = useState<string[]>([]);
  const [geoInput, setGeoInput] = useState("");
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoSuggestions, setGeoSuggestions] = useState<GeoSuggestionItem[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);

  const [result, setResult] = useState<MultiStudyResult | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [sheetsLoading, setSheetsLoading] = useState(false);

  useEffect(() => {
    if (!geoInput.trim()) {
      setGeoSuggestions([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setGeoLoading(true);
      try {
        const res = await suggestGoogleLocations({
          query: geoInput.trim(),
          country,
          geo_type: geoType,
          limit: 25,
        });
        if (!controller.signal.aborted) setGeoSuggestions(res);
      } catch {
        if (!controller.signal.aborted) setGeoSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setGeoLoading(false);
      }
    }, 250);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [geoInput, country, geoType]);

  function updateBriefing<K extends keyof BriefingData>(key: K, value: BriefingData[K]) {
    setBriefing((prev) => ({ ...prev, [key]: value }));
  }

  function addUrl() {
    setBriefing((prev) => ({ ...prev, urls: [...prev.urls, ""] }));
  }

  function updateUrl(idx: number, value: string) {
    setBriefing((prev) => {
      const next = [...prev.urls];
      next[idx] = value;
      return { ...prev, urls: next };
    });
  }

  function removeUrl(idx: number) {
    setBriefing((prev) => ({ ...prev, urls: prev.urls.filter((_, i) => i !== idx) }));
  }

  async function onRunAgebri() {
    setAgebriError(null);
    setAgebriLoading(true);
    try {
      const res = await runAgebri(briefing);
      setAgebriResult(res);
    } catch (err) {
      setAgebriError(err instanceof Error ? err.message : "Falha ao consultar AGEBRI.");
    } finally {
      setAgebriLoading(false);
    }
  }

  function useAgebriCategoryAsTab(name: string, keywords: string[]) {
    setTabs((prev) => {
      const exists = prev.find((t) => t.name.toLowerCase() === name.toLowerCase());
      if (exists) return prev;
      if (prev.length >= MAX_TABS) return prev;
      return [...prev, { id: makeId(), name, seedsInput: "", seeds: keywords.slice(0, 50) }];
    });
  }

  function addGeoChip(value: string, id?: string) {
    const chip = geoValue(geoType, value, id);
    if (!geoChips.includes(chip)) setGeoChips((prev) => [...prev, chip]);
    setGeoInput("");
    setGeoOpen(false);
    setGeoSuggestions([]);
  }

  function removeGeoChip(chip: string) {
    setGeoChips((prev) => prev.filter((c) => c !== chip));
  }

  function updateTab(id: string, patch: Partial<TabDraft>) {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function commitSeedsFromInput(id: string) {
    setTabs((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t;
        const parsed = splitSeeds(t.seedsInput);
        const merged = [...t.seeds];
        const seen = new Set(merged.map((s) => s.toLowerCase()));
        for (const s of parsed) {
          if (seen.has(s.toLowerCase())) continue;
          seen.add(s.toLowerCase());
          merged.push(s);
        }
        return { ...t, seeds: merged, seedsInput: "" };
      })
    );
  }

  function removeSeed(tabId: string, seed: string) {
    updateTab(tabId, {
      seeds: (tabs.find((t) => t.id === tabId)?.seeds || []).filter((s) => s !== seed),
    });
  }

  function addTab() {
    if (tabs.length >= MAX_TABS) return;
    setTabs((prev) => [
      ...prev,
      { id: makeId(), name: `Aba ${prev.length + 1}`, seedsInput: "", seeds: [] },
    ]);
  }

  function removeTab(id: string) {
    setTabs((prev) => prev.filter((t) => t.id !== id));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStatus(null);

    const finalTabs = tabs.map((t) => {
      const pending = splitSeeds(t.seedsInput);
      const seedSet = new Set(t.seeds.map((s) => s.toLowerCase()));
      const merged = [...t.seeds];
      for (const s of pending) {
        if (seedSet.has(s.toLowerCase())) continue;
        seedSet.add(s.toLowerCase());
        merged.push(s);
      }
      return { name: t.name.trim() || "Aba", seeds: merged };
    });

    const validTabs = finalTabs.filter((t) => t.seeds.length > 0);
    if (validTabs.length === 0) {
      setError("Adicione ao menos uma aba com seeds.");
      return;
    }

    setLoading(true);
    setResult(null);
    setStatus(`Rodando ${validTabs.length} abas em paralelo…`);

    try {
      const payload: { tabs: MultiTabSpec[]; locations: string[]; country: string; limit: number } = {
        tabs: validTabs,
        locations: geoChips,
        country,
        limit,
      };
      const data = await generateMultiStudy(payload);
      setResult(data);
      setActiveTab(data.tabs[0]?.name ?? null);
      setStatus(
        `${data.tabs.length} abas geradas. Total keywords: ${data.tabs.reduce(
          (acc, t) => acc + t.items.length,
          0
        )}.`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao gerar estudo.");
    } finally {
      setLoading(false);
    }
  }

  async function onDownload() {
    if (!result) return;
    try {
      const blob = await downloadMultiStudyXlsx(result);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estudo-multi-${result.id.slice(0, 8)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao baixar XLSX.");
    }
  }

  async function onExportSheets() {
    if (!result) return;
    setSheetsLoading(true);
    try {
      const { url } = await exportMultiStudyToSheets(result);
      window.open(url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao exportar para Google Sheets.");
    } finally {
      setSheetsLoading(false);
    }
  }

  const activeItems = useMemo(() => {
    if (!result || !activeTab) return [];
    return result.tabs.find((t) => t.name === activeTab)?.items ?? [];
  }, [result, activeTab]);

  const totalSeeds = tabs.reduce((acc, t) => acc + t.seeds.length, 0);

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>P12 / Keywords</span>
        </div>
        <div className="topbar-meta">
          <Link href="/" style={{ color: "var(--text-dim)" }}>← Voltar</Link>
          <span className="brand-divider">·</span>
          <span>multi-aba</span>
        </div>
      </header>

      <section className="hero">
        <div className="crumb mono">
          <span className="slash">/</span>
          <span>automações</span>
          <span className="slash">/</span>
          <span>keywords-p12</span>
          <span className="slash">/</span>
          <span className="here">multi</span>
        </div>
        <h1 className="hero-title display">
          Estudo Multi-Aba
          <br />
          <span className="dim">Google Ads.</span>
        </h1>
        <p className="hero-sub">
          Defina N abas, cada uma com suas próprias seeds. Backend roda tudo em paralelo e exporta um único XLSX
          com layout idêntico ao Planejador Google.
        </p>
        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label mono">Abas</div>
            <div className="hero-stat-value mono">
              <span className="accent">{pad(tabs.length, 2)}</span>
              <span style={{ color: "var(--text-faint)" }}> / {pad(MAX_TABS, 2)}</span>
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label mono">Seeds total</div>
            <div className="hero-stat-value mono">
              <span className="accent">{pad(totalSeeds, 3)}</span>
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label mono">Limite p/ aba</div>
            <div className="hero-stat-value mono">{pad(limit, 4)}</div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label mono">Resultado</div>
            <div className="hero-stat-value mono">
              {result ? `${result.tabs.length} abas` : "—"}
            </div>
          </div>
        </div>
      </section>

      {/* ── ETAPA 1: BRIEFING + AGEBRI ────────────────────────────────── */}
      <div className="panel search search-google">
        <span className="panel-label mono">
          <span className="accent">●</span> agente IA · briefing do cliente
        </span>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">01</span> Nome da empresa</label>
          <input
            value={briefing.company_name}
            onChange={(e) => updateBriefing("company_name", e.target.value)}
            placeholder="Clínica Estética Bella Forma"
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">02</span> Sobre a empresa</label>
          <textarea
            rows={3}
            value={briefing.description}
            onChange={(e) => updateBriefing("description", e.target.value)}
            placeholder="Clínica de estética facial e corporal em São Paulo (Zona Sul). Atendimento 100% particular, sem convênios. Foco em procedimentos minimamente invasivos com médicos especialistas."
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">03</span> Especialidade / nicho</label>
          <input
            value={briefing.niche}
            onChange={(e) => updateBriefing("niche", e.target.value)}
            placeholder="Estética facial avançada — harmonização e rejuvenescimento"
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">04</span> Principais serviços / produtos</label>
          <textarea
            rows={3}
            value={briefing.services}
            onChange={(e) => updateBriefing("services", e.target.value)}
            placeholder="Botox e toxina botulínica, preenchimento labial com ácido hialurônico, bioestimuladores de colágeno, harmonização facial, peeling químico, limpeza de pele profunda, fios de PDO."
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">05</span> Público-alvo</label>
          <input
            value={briefing.target_audience}
            onChange={(e) => updateBriefing("target_audience", e.target.value)}
            placeholder="Mulheres 30–55 anos, classe B/C, São Paulo capital e Grande SP"
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">06</span> Objetivo principal</label>
          <input
            value={briefing.main_objective}
            onChange={(e) => updateBriefing("main_objective", e.target.value)}
            placeholder="Aumentar agendamentos de botox e harmonização facial via Google Ads"
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">07</span> Concorrentes</label>
          <textarea
            rows={2}
            value={briefing.competitors}
            onChange={(e) => updateBriefing("competitors", e.target.value)}
            placeholder="Clínica Visage (Vila Olímpia), Instituto Bela (Moema), Dr. Paulo Estética (Itaim)..."
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">08</span> Observações livres</label>
          <textarea
            rows={3}
            value={briefing.observations}
            onChange={(e) => updateBriefing("observations", e.target.value)}
            placeholder="Atendemos somente com agendamento prévio. Não trabalhamos com convênios nem planos de saúde. Temos estacionamento próprio. Diferenciais: médicos CRM, ambiente discreto, sem filas."
          />
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">09</span> URL(s) para análise</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {briefing.urls.map((url, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8 }}>
                <input
                  value={url}
                  onChange={(e) => updateUrl(idx, e.target.value)}
                  placeholder="https://clinicabellaforma.com.br"
                  style={{ flex: 1 }}
                  type="url"
                />
                {briefing.urls.length > 1 && (
                  <button type="button" className="btn-ghost mono" onClick={() => removeUrl(idx)}>×</button>
                )}
              </div>
            ))}
            <button type="button" className="btn-ghost mono" onClick={addUrl} style={{ alignSelf: "flex-start" }}>
              + Adicionar URL
            </button>
          </div>
        </div>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label><span className="idx">10</span> Restringir / Negativar</label>
          <textarea
            rows={3}
            value={briefing.restrict_keywords}
            onChange={(e) => updateBriefing("restrict_keywords", e.target.value)}
            placeholder="plano de saúde, convênio, SUS, gratuito, curso de estética, faculdade, emprego, vaga de emprego, salário, aparelho, manutenção, peças"
          />
        </div>

        <div className="submit-wrap">
          <button
            type="button"
            className={`btn-primary ${agebriLoading ? "is-loading" : ""}`}
            disabled={agebriLoading}
            onClick={onRunAgebri}
          >
            {agebriLoading ? "Consultando AGEBRI…" : "Gerar Palavras com AGEBRI"}
          </button>
        </div>

        {agebriError && <div className="status error mono" style={{ gridColumn: "1 / -1" }}>{agebriError}</div>}
      </div>

      {/* ── RESULTADO AGEBRI ────────────────────────────────────────────── */}
      {agebriResult && (
        <div className="panel" style={{ marginTop: 0 }}>
          <span className="panel-label mono">
            <span className="accent">●</span> AGEBRI · resultado
          </span>

          {agebriResult.restrict_suggestions.length > 0 && (
            <div style={{ gridColumn: "1 / -1", marginBottom: 8 }}>
              <div className="geo-label mono" style={{ marginBottom: 6 }}>Sugestões para negativar</div>
              <div className="geo-chips-row">
                {agebriResult.restrict_suggestions.map((s) => (
                  <span key={s} className="geo-chip mono">{s}</span>
                ))}
              </div>
            </div>
          )}

          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 14 }}>
            {agebriResult.categories.map((cat) => (
              <div
                key={cat.name}
                style={{
                  border: "1px solid var(--border)",
                  padding: 12,
                  background: "var(--surface-2, transparent)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span className="mono" style={{ fontWeight: 600, fontSize: 13 }}>{cat.name}</span>
                  <button
                    type="button"
                    className="btn-ghost mono"
                    style={{ fontSize: 11 }}
                    onClick={() => useAgebriCategoryAsTab(cat.name, cat.keywords)}
                  >
                    Usar como aba →
                  </button>
                </div>
                <div className="chips-box">
                  {cat.keywords.map((kw) => (
                    <span key={kw} className="chip-kw mono">{kw}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ETAPA 2: ABAS DO ESTUDO ─────────────────────────────────────── */}
      <form className="panel search search-google" onSubmit={onSubmit}>
        <span className="panel-label mono">
          <span className="accent">●</span> abas do estudo
        </span>

        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {tabs.map((tab, idx) => (
              <div
                key={tab.id}
                style={{
                  border: "1px solid var(--border)",
                  padding: 14,
                  background: "var(--surface-2, transparent)",
                }}
              >
                <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
                  <span className="idx mono" style={{ alignSelf: "center" }}>
                    {pad(idx + 1, 2)}
                  </span>
                  <input
                    value={tab.name}
                    onChange={(e) => updateTab(tab.id, { name: e.target.value })}
                    placeholder="Nome da aba (ex: Botox · Toxina Botulínica)"
                    style={{ flex: 1 }}
                    maxLength={31}
                  />
                  <button
                    type="button"
                    className="btn-ghost mono"
                    onClick={() => removeTab(tab.id)}
                    disabled={tabs.length === 1}
                  >
                    Remover
                  </button>
                </div>
                <div className="chips-box">
                  {tab.seeds.map((seed) => (
                    <span className="chip-kw mono" key={seed}>
                      {seed}
                      <button type="button" onClick={() => removeSeed(tab.id, seed)} aria-label={`Remover ${seed}`}>
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    value={tab.seedsInput}
                    onChange={(e) => updateTab(tab.id, { seedsInput: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === ",") {
                        e.preventDefault();
                        commitSeedsFromInput(tab.id);
                      }
                    }}
                    onBlur={() => commitSeedsFromInput(tab.id)}
                    placeholder="Seeds (Enter ou vírgula para adicionar)…"
                  />
                </div>
                <div className="chip-counter mono">
                  {pad(tab.seeds.length, 2)} seeds
                </div>
              </div>
            ))}
            <button
              type="button"
              className="btn-ghost mono"
              onClick={addTab}
              disabled={tabs.length >= MAX_TABS}
              style={{ alignSelf: "flex-start" }}
            >
              + Adicionar aba
            </button>
          </div>
        </div>

        <div className="geo-section">
          <div className="geo-label mono">Localização padrão (todas abas)</div>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="multi-country">
              <span className="idx">País</span> Contexto
            </label>
            <select
              id="multi-country"
              value={country}
              onChange={(e) => setCountry(e.target.value.toUpperCase())}
            >
              <option value="BR">BR — Brasil</option>
              <option value="US">US — United States</option>
              <option value="PT">PT — Portugal</option>
              <option value="MX">MX — México</option>
              <option value="AR">AR — Argentina</option>
              <option value="CO">CO — Colômbia</option>
              <option value="CL">CL — Chile</option>
            </select>
          </div>
          <div className="geo-type-row">
            {(["country", "state", "city"] as GeoType[]).map((item) => (
              <button
                key={item}
                type="button"
                className={`geo-type-btn ${geoType === item ? "is-active" : ""}`}
                onClick={() => {
                  setGeoType(item);
                  setGeoInput("");
                  setGeoSuggestions([]);
                  setGeoOpen(false);
                }}
              >
                {GEO_TYPE_LABELS[item]}
              </button>
            ))}
          </div>
          <div className="geo-chips-row">
            {geoChips.map((chip) => (
              <span className="geo-chip mono" key={chip}>
                {geoLabel(chip)}
                <button type="button" onClick={() => removeGeoChip(chip)} aria-label={`Remover ${chip}`}>
                  ×
                </button>
              </span>
            ))}
          </div>
          <div className="geo-suggestions">
            <div className="geo-input-row">
              <input
                placeholder={`Buscar ${GEO_TYPE_LABELS[geoType].toLowerCase()} no Google Ads…`}
                value={geoInput}
                onChange={(e) => {
                  setGeoInput(e.target.value);
                  setGeoOpen(true);
                }}
                onFocus={() => setGeoOpen(true)}
                onBlur={() => setTimeout(() => setGeoOpen(false), 150)}
                autoComplete="off"
              />
            </div>
            {geoOpen && (
              <div className="geo-dropdown">
                {geoLoading && <div className="geo-option">Buscando localizações…</div>}
                {!geoLoading && geoSuggestions.length === 0 && (
                  <div className="geo-option">Digite para buscar.</div>
                )}
                {!geoLoading &&
                  geoSuggestions.map((item) => (
                    <button
                      key={`${item.id}-${item.name}`}
                      type="button"
                      className="geo-option"
                      onMouseDown={() => addGeoChip(item.name, item.id)}
                    >
                      {item.name} · {item.target_type} · {item.country_code}
                    </button>
                  ))}
              </div>
            )}
          </div>
        </div>

        <div className="field">
          <label htmlFor="multi-limit">
            <span className="idx">02</span> Limite por aba
          </label>
          <input
            id="multi-limit"
            type="number"
            min={1}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </div>

        <div className="submit-wrap">
          <button type="submit" className={`btn-primary ${loading ? "is-loading" : ""}`} disabled={loading}>
            {loading ? "Processando" : "Gerar Estudo"}
          </button>
        </div>
      </form>

      {error && <div className="status error mono">{error}</div>}
      {status && <div className="status info mono">{status}</div>}

      {result && (
        <>
          <div className="study-header">
            <h2 className="study-title display">Estudo Multi-Aba</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-download" onClick={onDownload}>
                Baixar XLSX
              </button>
              <button
                type="button"
                className="btn-download"
                onClick={onExportSheets}
                disabled={sheetsLoading}
              >
                {sheetsLoading ? "Exportando…" : "Exportar Google Sheets"}
              </button>
            </div>
          </div>
          <div className="study-tabs">
            {result.tabs.map((tab) => (
              <button
                key={tab.name}
                type="button"
                className={`study-tab mono ${activeTab === tab.name ? "is-active" : ""}`}
                onClick={() => setActiveTab(tab.name)}
              >
                {tab.name}
                <span style={{ color: "var(--text-faint)", marginLeft: 6, fontSize: 10 }}>
                  ({tab.items.length})
                </span>
              </button>
            ))}
          </div>

          <section className="table-shell">
            <div className="table-head-meta mono">
              <span>{pad(activeItems.length, 4)} rows · {activeTab}</span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th className="mono">Palavra-Chave</th>
                    <th className="mono">Média</th>
                    <th className="mono">3M</th>
                    <th className="mono">YoY</th>
                    <th className="mono">Concorrência</th>
                    <th className="mono">Grau</th>
                    <th className="mono">Lance min</th>
                    <th className="mono">Lance max</th>
                  </tr>
                </thead>
                <tbody>
                  {activeItems.map((item, idx) => {
                    const it = item as Record<string, unknown>;
                    return (
                      <tr key={`${activeTab}-${idx}`}>
                        <td className="name">{(it.name as string) || "—"}</td>
                        <td className="num mono">{(it.media_pesquisas as number) ?? "—"}</td>
                        <td className="num mono">{(it.mudanca_tres_meses as string) ?? "—"}</td>
                        <td className="num mono">{(it.mudanca_ano_anterior as string) ?? "—"}</td>
                        <td className="mono">{(it.concorrencia as string) || "—"}</td>
                        <td className="num mono">{(it.grau_concorrencia as number) ?? "—"}</td>
                        <td className="num mono">{(it.menor_lance_topo as number) ?? "—"}</td>
                        <td className="num mono">{(it.maior_lance_topo as number) ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <footer className="foot mono">
        <span>© P12 Digital · uso interno</span>
        <span>keywords-p12 · multi-aba</span>
      </footer>
    </div>
  );
}
