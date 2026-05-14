"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteStudy,
  downloadStudyXlsx,
  generateStudy,
  listStudies,
  loadStudy,
  saveStudy,
  searchGoogleKeywords,
  searchMetaInterests,
} from "../lib/api";
import { isFavorite, toggleFavorite } from "../lib/storage";
import { AdGroup, InterestItem, StudyMeta, StudyResult } from "../lib/types";

type StatusType = "info" | "error" | "warning";
type Provider = "meta" | "google";
type GoogleMode = "search" | "study";
type GeoType = "country" | "state" | "city";
type SortDirection = "asc" | "desc";
type TableColumn = { key: string; label: string };

const MAX_KEYWORDS = 50;

const GEO_OPTIONS: Record<GeoType, { label: string; values: string[] }> = {
  country: {
    label: "País",
    values: ["Brasil", "United States", "Portugal", "México", "Argentina", "Colômbia", "Chile"],
  },
  state: {
    label: "Estado",
    values: [
      "AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS",
      "MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO",
    ],
  },
  city: {
    label: "Cidade",
    values: [
      "São Paulo","Rio de Janeiro","Curitiba","Belo Horizonte","Porto Alegre",
      "Fortaleza","Salvador","Recife","Manaus","Brasília","Goiânia","Belém",
      "Campinas","São Luís","Maceió","Natal","Teresina","Campo Grande",
      "João Pessoa","Aracaju","Florianópolis","Vitória",
    ],
  },
};

function geoLabel(geo: string): string {
  const [type, ...rest] = geo.split(":");
  return rest.join(":");
}

function geoValue(type: GeoType, value: string): string {
  const map: Record<GeoType, string> = { country: "country", state: "state", city: "city" };
  return `${map[type]}:${value.toLowerCase()}`;
}

function formatNum(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatMoney(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 }).format(value);
}

function pad(n: number, size = 3): string {
  return String(n).padStart(size, "0");
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

export default function HomePage() {
  const [provider, setProvider] = useState<Provider>("meta");
  const [googleMode, setGoogleMode] = useState<GoogleMode>("search");

  // Meta search
  const [keyword, setKeyword] = useState("");

  // Google keywords chips
  const [googleKeywordInput, setGoogleKeywordInput] = useState("");
  const [googleKeywords, setGoogleKeywords] = useState<string[]>([]);

  // Geo targeting (Google only)
  const [geoType, setGeoType] = useState<GeoType>("country");
  const [geoChips, setGeoChips] = useState<string[]>(["country:brasil"]);
  const [geoInput, setGeoInput] = useState("");
  const [geoOpen, setGeoOpen] = useState(false);

  // Filters
  const [country, setCountry] = useState("BR");
  const [limit, setLimit] = useState(50);

  // Results (search mode)
  const [results, setResults] = useState<InterestItem[]>([]);
  const [tableWidthByProvider, setTableWidthByProvider] = useState<Record<Provider, number>>({ meta: 110, google: 180 });
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  // Study mode
  const [activeStudy, setActiveStudy] = useState<StudyResult | null>(null);
  const [studyTab, setStudyTab] = useState("Geral");
  const [insightsOpen, setInsightsOpen] = useState(true);
  const [adGroupsOpen, setAdGroupsOpen] = useState(false);

  // Dashboard
  const [savedStudies, setSavedStudies] = useState<StudyMeta[]>([]);
  const [studiesLoaded, setStudiesLoaded] = useState(false);

  // Favorites
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<StatusType>("info");
  const [lastQueryAt, setLastQueryAt] = useState("—");

  const canAddMoreKeywords = googleKeywords.length < MAX_KEYWORDS;
  const tableWidth = tableWidthByProvider[provider];

  // ── Geo filtering ────────────────────────────────────────
  const geoSuggestions = useMemo(() => {
    const opts = GEO_OPTIONS[geoType].values;
    if (!geoInput.trim()) return opts;
    return opts.filter((v) => v.toLowerCase().includes(geoInput.toLowerCase()));
  }, [geoType, geoInput]);

  function addGeoChip(value: string) {
    const chip = geoValue(geoType, value);
    if (!geoChips.includes(chip)) setGeoChips((prev) => [...prev, chip]);
    setGeoInput("");
    setGeoOpen(false);
  }

  function removeGeoChip(chip: string) {
    setGeoChips((prev) => prev.filter((c) => c !== chip));
  }

  // ── Keyword chips ────────────────────────────────────────
  function normalizeKw(v: string) { return v.replace(/\s+/g, " ").trim(); }

  function addGoogleKeyword(raw: string) {
    const kw = normalizeKw(raw);
    if (!kw) return;
    if (!canAddMoreKeywords) {
      setStatusType("warning");
      setStatusMessage(`Limite de ${MAX_KEYWORDS} palavras-chave atingido.`);
      return;
    }
    if (googleKeywords.some((k) => k.toLowerCase() === kw.toLowerCase())) return;
    setGoogleKeywords((prev) => [...prev, kw]);
    setGoogleKeywordInput("");
  }

  function removeGoogleKeyword(v: string) {
    setGoogleKeywords((prev) => prev.filter((k) => k !== v));
  }

  // ── Table columns ─────────────────────────────────────────
  const googleMonthHeaders = useMemo(() => {
    const source = activeStudy && studyTab !== "Geral"
      ? activeStudy.categories[studyTab] ?? []
      : activeStudy
        ? activeStudy.general
        : results;
    const ordered: string[] = [];
    for (const item of source) {
      for (const h of Object.keys(item.searches_mensais ?? {})) {
        if (!ordered.includes(h)) ordered.push(h);
      }
    }
    return ordered;
  }, [results, activeStudy, studyTab]);

  const metaColumns = useMemo<TableColumn[]>(() => [
    { key: "name", label: "Nome" },
    { key: "audience_size", label: "Audiência" },
    { key: "type", label: "Tipo" },
    { key: "path", label: "Categoria" },
  ], []);

  const googleColumns = useMemo<TableColumn[]>(() => [
    { key: "name", label: "Palavra-Chave" },
    { key: "media_pesquisas", label: "Média Pesquisas" },
    { key: "mudanca_tres_meses", label: "Δ 3m" },
    { key: "mudanca_ano_anterior", label: "Δ 12m" },
    { key: "concorrencia", label: "Concorrência" },
    { key: "grau_concorrencia", label: "Grau" },
    { key: "menor_lance_topo", label: "Lance mín. topo" },
    { key: "maior_lance_topo", label: "Lance máx. topo" },
    ...googleMonthHeaders.map((h) => ({ key: `month:${h}`, label: h })),
  ], [googleMonthHeaders]);

  // ── Sorting ───────────────────────────────────────────────
  function onSort(key: string) {
    if (sortColumn === key) { setSortDirection((d) => d === "asc" ? "desc" : "asc"); return; }
    setSortColumn(key);
    setSortDirection("asc");
  }

  function getSortValue(item: InterestItem, key: string): string | number {
    if (key === "path") return (item.path ?? []).join(" ").toLowerCase();
    if (key.startsWith("month:")) return item.searches_mensais?.[key.replace("month:", "")] ?? -1;
    const v = (item as Record<string, unknown>)[key];
    if (typeof v === "number") return v;
    if (typeof v === "string") return v.toLowerCase();
    return "";
  }

  const activeItems: InterestItem[] = useMemo(() => {
    if (activeStudy) {
      return studyTab === "Geral" ? activeStudy.general : (activeStudy.categories[studyTab] ?? []);
    }
    return results;
  }, [activeStudy, studyTab, results]);

  const sortedResults = useMemo(() => {
    const cloned = [...activeItems];
    if (!sortColumn) return cloned;
    cloned.sort((a, b) => {
      const av = getSortValue(a, sortColumn), bv = getSortValue(b, sortColumn);
      const cmp = typeof av === "number" && typeof bv === "number"
        ? av - bv
        : String(av).localeCompare(String(bv), "pt-BR");
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return cloned;
  }, [activeItems, sortColumn, sortDirection]);

  // ── Search / Study ─────────────────────────────────────────
  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const kwList = provider === "google"
      ? [...googleKeywords, normalizeKw(googleKeywordInput)].filter(Boolean)
      : [];

    if (provider === "meta" && !keyword.trim()) { setErrorMessage("Informe uma keyword."); return; }
    if (provider === "google" && kwList.length === 0) { setErrorMessage("Adicione ao menos uma palavra-chave."); return; }

    setLoading(true);
    setActiveStudy(null);
    setResults([]);

    try {
      if (provider === "meta") {
        const data = await searchMetaInterests({ keyword: keyword.trim(), country, limit });
        setResults(data.results);
        setStatusType("info");
        setStatusMessage(data.results.length === 0 ? "Nenhum resultado encontrado." : `${data.results.length} resultados carregados.`);
      } else if (googleMode === "search") {
        const data = await searchGoogleKeywords({
          keyword: kwList[0] ?? "",
          keywords: kwList,
          country,
          limit,
          locations: geoChips,
        });
        setResults(data.results);
        setStatusType("info");
        setStatusMessage(data.results.length === 0 ? "Nenhuma keyword encontrada." : `${data.results.length} resultados carregados.`);
      } else {
        // Study mode
        setStatusType("info");
        setStatusMessage("Gerando estudo — isso pode levar até 60s…");
        const study = await generateStudy({ keywords: kwList, locations: geoChips, country, limit });
        setActiveStudy(study);
        setStudyTab("Geral");
        setInsightsOpen(true);
        setStatusType("info");
        setStatusMessage(`Estudo criado: ${study.general.length} keywords em ${Object.keys(study.categories).length} categorias.`);
        try { await saveStudy(study); await refreshStudies(); } catch { /* best-effort */ }
      }
      setLastQueryAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Falha ao consultar API.");
    } finally {
      setLoading(false);
    }
  }

  // ── Download ──────────────────────────────────────────────
  async function onDownload() {
    if (!activeStudy) return;
    try {
      const blob = await downloadStudyXlsx(activeStudy);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `estudo-keywords-${activeStudy.id.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErrorMessage("Falha ao gerar XLSX.");
    }
  }

  // ── Studies CRUD ──────────────────────────────────────────
  const refreshStudies = useCallback(async () => {
    try { setSavedStudies(await listStudies()); setStudiesLoaded(true); } catch { /* edge: offline */ }
  }, []);

  async function onLoadStudy(id: string) {
    try {
      const study = await loadStudy(id);
      setActiveStudy(study);
      setStudyTab("Geral");
      setProvider("google");
      setGoogleMode("study");
      setInsightsOpen(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch { setErrorMessage("Não foi possível carregar o estudo."); }
  }

  async function onDeleteStudy(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    await deleteStudy(id);
    await refreshStudies();
  }

  useEffect(() => { refreshStudies(); }, [refreshStudies]);

  // ── Favorites ─────────────────────────────────────────────
  useEffect(() => {
    setFavoriteIds(new Set(results.filter((i) => isFavorite(i.id)).map((i) => i.id)));
  }, [results]);

  function onToggleFavorite(item: InterestItem) {
    const now = toggleFavorite(item);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      now ? next.add(item.id) : next.delete(item.id);
      return next;
    });
    setStatusType("info");
    setStatusMessage(now ? "Salvo." : "Removido dos salvos.");
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setStatusType("info");
    setStatusMessage(`${label} copiado.`);
  }

  const studyTabs = activeStudy ? ["Geral", ...Object.keys(activeStudy.categories)] : [];
  const emptyState = !loading && !errorMessage && sortedResults.length === 0 && !activeStudy;
  const savedCount = favoriteIds.size;

  return (
    <div className="shell">
      {/* ── Topbar ── */}
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>P12 / Keywords</span>
        </div>
        <div className="topbar-meta">
          <span className="signal-dot">API online</span>
          <span className="brand-divider">·</span>
          <span>v0.2.0</span>
          <span className="brand-divider">·</span>
          <span>PT-BR</span>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="hero">
        <div className="crumb mono">
          <span className="slash">/</span>
          <span>automações</span>
          <span className="slash">/</span>
          <span className="here">keywords-p12</span>
        </div>
        <h1 className="hero-title display">
          Plataforma de Estudo<br />
          <span className="dim">de Keywords.</span>
        </h1>
        <p className="hero-sub">
          Pesquisa avançada Meta Ads + Google Ads. Geração de estudos com IA, categorização automática,
          exportação XLSX e grupos de anúncios prontos.
        </p>

        <div className="hero-stats">
          {[
            { label: "Resultados", value: <><span className="accent">{pad(activeStudy ? activeStudy.general.length : results.length)}</span><span style={{ color: "var(--text-faint)" }}> / {pad(limit)}</span></> },
            { label: "Provedor", value: provider === "meta" ? "META.ADS" : "GOOGLE.ADS" },
            { label: "Categorias", value: <span className="accent">{pad(activeStudy ? Object.keys(activeStudy.categories).length : 0)}</span> },
            { label: "Última busca", value: <span style={{ fontSize: 16 }}>{lastQueryAt}</span> },
          ].map(({ label, value }) => (
            <div className="hero-stat" key={label}>
              <div className="hero-stat-label mono">{label}</div>
              <div className="hero-stat-value mono">{value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Provider tabs ── */}
      <nav className="tabs" aria-label="Provedor">
        {(["meta", "google"] as Provider[]).map((p, i) => (
          <button
            key={p}
            type="button"
            className={`tab ${provider === p ? "is-active" : ""}`}
            onClick={() => { setProvider(p); setResults([]); setActiveStudy(null); }}
          >
            <span className="tab-idx">[{String(i + 1).padStart(2, "0")}]</span>
            <span>{p === "meta" ? "Meta Ads" : "Google Ads"}</span>
          </button>
        ))}
        {savedStudies.length > 0 && (
          <button
            type="button"
            className="tab"
            onClick={() => document.getElementById("studies-section")?.scrollIntoView({ behavior: "smooth" })}
          >
            <span className="tab-idx">[03]</span>
            <span>Meus Estudos · {savedStudies.length}</span>
          </button>
        )}
      </nav>

      {/* ── Search form ── */}
      <form
        className={`panel search ${provider === "google" ? "search-google" : ""}`}
        onSubmit={onSubmit}
      >
        <span className="panel-label mono">
          <span className="accent">●</span> {provider === "google" && googleMode === "study" ? "gerar estudo" : "busca / parâmetros"}
        </span>

        {provider === "meta" ? (
          <div className="field field-keyword">
            <label htmlFor="keyword"><span className="idx">01</span> Keyword</label>
            <input
              id="keyword"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="emagrecimento, fitness, skincare…"
              autoComplete="off"
            />
          </div>
        ) : (
          <div className="field field-google">
            {/* Mode toggle */}
            <div className="mode-toggle">
              <button type="button" className={`mode-btn ${googleMode === "search" ? "is-active" : ""}`} onClick={() => setGoogleMode("search")}>
                🔍 Buscar Keywords
              </button>
              <button type="button" className={`mode-btn ${googleMode === "study" ? "is-active" : ""}`} onClick={() => setGoogleMode("study")}>
                📊 Gerar Estudo
              </button>
            </div>

            <label htmlFor="google-kw-input">
              <span className="idx">01</span>
              {googleMode === "study" ? "Palavras-chave do estudo" : "Produtos / serviços relacionados"}
            </label>
            <div className="chips-box">
              {googleKeywords.map((kw) => (
                <span className="chip-kw mono" key={kw}>
                  {kw}
                  <button type="button" onClick={() => removeGoogleKeyword(kw)} aria-label={`Remover ${kw}`}>×</button>
                </span>
              ))}
              <input
                id="google-kw-input"
                value={googleKeywordInput}
                onChange={(e) => setGoogleKeywordInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addGoogleKeyword(googleKeywordInput); }
                }}
                placeholder={canAddMoreKeywords ? "Digite e pressione Enter…" : `Limite de ${MAX_KEYWORDS} atingido`}
                disabled={!canAddMoreKeywords}
                autoComplete="off"
              />
            </div>
            <div className="chip-counter mono">
              {pad(googleKeywords.length, 2)} / {MAX_KEYWORDS} palavras-chave
            </div>

            {/* Geo targeting */}
            <div className="geo-section">
              <div className="geo-label mono">Localização</div>
              <div className="geo-type-row">
                {(["country", "state", "city"] as GeoType[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    className={`geo-type-btn ${geoType === t ? "is-active" : ""}`}
                    onClick={() => { setGeoType(t); setGeoInput(""); setGeoOpen(false); }}
                  >
                    {GEO_OPTIONS[t].label}
                  </button>
                ))}
              </div>

              <div className="geo-chips-row">
                {geoChips.map((chip) => (
                  <span className="geo-chip mono" key={chip}>
                    {geoLabel(chip)}
                    <button type="button" onClick={() => removeGeoChip(chip)} aria-label={`Remover ${chip}`}>×</button>
                  </span>
                ))}
              </div>

              <div className="geo-suggestions">
                <div className="geo-input-row">
                  <input
                    placeholder={`Buscar ${GEO_OPTIONS[geoType].label.toLowerCase()}…`}
                    value={geoInput}
                    onChange={(e) => { setGeoInput(e.target.value); setGeoOpen(true); }}
                    onFocus={() => setGeoOpen(true)}
                    onBlur={() => setTimeout(() => setGeoOpen(false), 150)}
                    autoComplete="off"
                  />
                </div>
                {geoOpen && geoSuggestions.length > 0 && (
                  <div className="geo-dropdown">
                    {geoSuggestions.map((s) => (
                      <button key={s} type="button" className="geo-option" onMouseDown={() => addGeoChip(s)}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {provider === "meta" && (
          <div className="field">
            <label htmlFor="country"><span className="idx">02</span> País</label>
            <select id="country" value={country} onChange={(e) => setCountry(e.target.value.toUpperCase())}>
              <option value="BR">BR — Brasil</option>
              <option value="US">US — United States</option>
              <option value="PT">PT — Portugal</option>
              <option value="MX">MX — México</option>
            </select>
          </div>
        )}

        <div className="field">
          <label htmlFor="limit">
            <span className="idx">{provider === "meta" ? "03" : "02"}</span> Limite
          </label>
          <input
            id="limit"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
          />
        </div>

        <div className="submit-wrap">
          <button type="submit" className={`btn-primary ${loading ? "is-loading" : ""}`} disabled={loading}>
            {loading
              ? googleMode === "study" && provider === "google" ? "Gerando…" : "Processando"
              : googleMode === "study" && provider === "google" ? "Gerar Estudo" : "Buscar"}
          </button>
        </div>
      </form>

      {/* ── Status messages ── */}
      {errorMessage && <div className="status error mono">{errorMessage}</div>}
      {statusMessage && <div className={`status ${statusType} mono`}>{statusMessage}</div>}

      {/* ── Study view ── */}
      {activeStudy && (
        <>
          <div className="study-header">
            <h2 className="study-title display">
              Estudo · {activeStudy.seed_keywords.slice(0, 3).join(", ")}
              {activeStudy.seed_keywords.length > 3 ? "…" : ""}
            </h2>
            <button type="button" className="btn-download" onClick={onDownload}>
              ⬇ Exportar XLSX
            </button>
          </div>

          <div className="study-tabs">
            {studyTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`study-tab mono ${studyTab === tab ? "is-active" : ""}`}
                onClick={() => setStudyTab(tab)}
              >
                {tab}
                {tab !== "Geral" && (
                  <span style={{ color: "var(--text-faint)", marginLeft: 6, fontSize: 10 }}>
                    ({activeStudy.categories[tab]?.length ?? 0})
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Insights */}
          {activeStudy.insights.length > 0 && (
            <div className="collapse-section">
              <button
                type="button"
                className="collapse-header mono"
                onClick={() => setInsightsOpen((v) => !v)}
              >
                Insights da IA <span>{insightsOpen ? "▲" : "▼"}</span>
              </button>
              {insightsOpen && (
                <div className="collapse-body">
                  <ul className="insights-list">
                    {activeStudy.insights.map((insight, i) => (
                      <li key={i}>{insight}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Ad groups */}
          {Object.keys(activeStudy.ad_groups).length > 0 && (
            <div className="collapse-section">
              <button
                type="button"
                className="collapse-header mono"
                onClick={() => setAdGroupsOpen((v) => !v)}
              >
                Grupos de Anúncios <span>{adGroupsOpen ? "▲" : "▼"}</span>
              </button>
              {adGroupsOpen && (
                <div className="collapse-body">
                  <div className="adgroup-grid">
                    {Object.entries(activeStudy.ad_groups).map(([cat, ag]: [string, AdGroup]) => (
                      <div className="adgroup-card" key={cat}>
                        <h3 className="adgroup-name">{ag.nome || cat}</h3>
                        {ag.palavras_positivas?.length > 0 && (
                          <div className="adgroup-section">
                            <div className="adgroup-section-label mono">Positivas</div>
                            <div className="kw-pills">
                              {ag.palavras_positivas.slice(0, 12).map((kw) => (
                                <span className="kw-pill positive" key={kw}>{kw}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {ag.palavras_negativas?.length > 0 && (
                          <div className="adgroup-section">
                            <div className="adgroup-section-label mono">Negativas</div>
                            <div className="kw-pills">
                              {ag.palavras_negativas.slice(0, 10).map((kw) => (
                                <span className="kw-pill negative" key={kw}>{kw}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(ag.extensoes?.sitelinks?.length > 0 || ag.extensoes?.callouts?.length > 0) && (
                          <div className="adgroup-section">
                            <div className="adgroup-section-label mono">Extensões</div>
                            <div className="kw-pills">
                              {[...(ag.extensoes.sitelinks ?? []), ...(ag.extensoes.callouts ?? [])].map((ext) => (
                                <span className="kw-pill extension" key={ext}>{ext}</span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Table ── */}
      {(sortedResults.length > 0 || loading) && (
        <>
          <div className="ribbon mono">
            <div className="left">
              <span className="dot" />
              <span>{activeStudy ? `Estudo · ${studyTab}` : provider === "meta" ? "meta_interests" : "google_keywords"}</span>
            </div>
            <div className="right">
              <span>{provider === "meta" ? "Meta Ads API" : "Google Ads API · keyword ideas"}</span>
            </div>
          </div>

          <div className="controls mono">
            <label htmlFor="table-width" className="controls-block">
              <span>Largura tabela</span>
              <span className="value">{tableWidth}%</span>
            </label>
            <input
              id="table-width"
              className="range"
              type="range"
              min={100}
              max={220}
              step={10}
              value={tableWidth}
              onChange={(e) => setTableWidthByProvider((prev) => ({ ...prev, [provider]: Number(e.target.value) }))}
            />
            <div className="note">clique nos títulos para ordenar</div>
          </div>

          <section className="table-shell">
            <div className="table-head-meta mono">
              <span>{pad(sortedResults.length, 4)} rows</span>
              <div className="table-head-actions">
                {activeStudy && (
                  <button type="button" className="btn-download" onClick={onDownload} style={{ padding: "6px 14px", fontSize: 11 }}>
                    ⬇ XLSX
                  </button>
                )}
              </div>
            </div>

            <div className="table-scroll">
              {loading ? (
                <div className="state">
                  <div className="spinner" />
                  <div className="state-tag mono">processando</div>
                  <p className="state-title">
                    {provider === "google" && googleMode === "study" ? "Gerando estudo com IA…" : "Consultando API…"}
                  </p>
                </div>
              ) : (
                <table style={{ minWidth: `${tableWidth}%` }}>
                  <thead>
                    <tr>
                      {(provider === "meta" ? metaColumns : googleColumns).map((col) => (
                        <th key={col.key} className="sortable mono" onClick={() => onSort(col.key)} title="Clique para ordenar">
                          {col.label}
                          {sortColumn === col.key && <span className="arrow">{sortDirection === "asc" ? "↑" : "↓"}</span>}
                        </th>
                      ))}
                      <th className="mono">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedResults.map((item) => (
                      <tr key={item.id}>
                        {provider === "meta" ? (
                          <>
                            <td className="name">{item.name || "—"}</td>
                            <td className="num mono">{formatNum(item.audience_size)}</td>
                            <td>{item.type ? <span className="type-pill mono">{item.type}</span> : <span className="muted">—</span>}</td>
                            <td>{item.path?.length > 0 ? item.path.map((p) => <span className="tag mono" key={p}>{p}</span>) : <span className="muted">—</span>}</td>
                            <td>
                              <div className="row-actions">
                                <button type="button" className="btn-ghost mono" onClick={() => copyText(item.name, "Nome")}>Copiar</button>
                                <button type="button" className={`btn-ghost mono ${favoriteIds.has(item.id) ? "is-active" : ""}`} onClick={() => onToggleFavorite(item)}>
                                  {favoriteIds.has(item.id) ? "Salvo" : "Salvar"}
                                </button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="name">{item.name || "—"}</td>
                            <td className="num mono">{formatNum(item.media_pesquisas)}</td>
                            <td className="num mono">{item.mudanca_tres_meses ?? "—"}</td>
                            <td className="num mono">{item.mudanca_ano_anterior ?? "—"}</td>
                            <td>{item.concorrencia ? <span className="type-pill mono">{item.concorrencia}</span> : <span className="muted">—</span>}</td>
                            <td className="num mono">{item.grau_concorrencia ?? "—"}</td>
                            <td className="num mono">{formatMoney(item.menor_lance_topo)}</td>
                            <td className="num mono">{formatMoney(item.maior_lance_topo)}</td>
                            {googleMonthHeaders.map((mh) => (
                              <td key={`${item.id}-${mh}`} className="num mono">{item.searches_mensais?.[mh] ?? "—"}</td>
                            ))}
                            <td>
                              <div className="row-actions">
                                <button type="button" className="btn-ghost mono" onClick={() => copyText(item.name, "Keyword")}>Copiar</button>
                                <button type="button" className={`btn-ghost mono ${favoriteIds.has(item.id) ? "is-active" : ""}`} onClick={() => onToggleFavorite(item)}>
                                  {favoriteIds.has(item.id) ? "Salvo" : "Salvar"}
                                </button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </section>
        </>
      )}

      {!loading && emptyState && (
        <div className="table-shell" style={{ marginTop: 20 }}>
          <div className="state">
            <div className="state-tag mono">idle</div>
            <p className="state-title">Nenhum resultado carregado. Execute uma busca para começar.</p>
          </div>
        </div>
      )}

      {/* ── Studies Dashboard ── */}
      {studiesLoaded && savedStudies.length > 0 && (
        <section className="studies-section" id="studies-section">
          <h2 className="studies-heading display">Meus Estudos</h2>
          <div className="studies-grid">
            {savedStudies.map((s) => {
              const kws = (() => {
                try { return JSON.parse(s.seed_keywords) as string[]; } catch { return []; }
              })();
              const locs = (() => {
                try { return JSON.parse(s.locations) as string[]; } catch { return []; }
              })();
              return (
                <div key={s.id} className="study-card" onClick={() => onLoadStudy(s.id)}>
                  <button
                    type="button"
                    className="study-card-delete"
                    onClick={(e) => onDeleteStudy(e, s.id)}
                    aria-label="Excluir estudo"
                  >
                    ×
                  </button>
                  <div className="study-card-date mono">{fmtDate(s.created_at)}</div>
                  <div className="study-card-keywords">
                    {kws.slice(0, 4).join(", ")}{kws.length > 4 ? "…" : ""}
                  </div>
                  <div className="study-card-meta mono">
                    <span>{s.country}</span>
                    {locs.length > 0 && <span>· {locs.map(geoLabel).slice(0, 2).join(", ")}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <footer className="foot mono">
        <span>© P12 Digital · uso interno</span>
        <span>keywords-p12 · edge runtime</span>
      </footer>
    </div>
  );
}
