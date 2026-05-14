"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { searchGoogleDiscovery, suggestGoogleLocations, searchMetaInterests } from "../lib/api";
import { discoveryExportFilename, downloadDiscoveryCsv, downloadDiscoveryXlsx } from "../lib/exportDiscovery";
import { buildGoogleTableColumns, GOOGLE_MONTH_COLUMNS, splitGoogleKeywords } from "../lib/googleColumns";
import { isFavorite, toggleFavorite } from "../lib/storage";
import { DiscoveryResult, GeoSuggestionItem, InterestItem } from "../lib/types";

type StatusType = "info" | "error" | "warning";
type Provider = "meta" | "google";
type GeoType = "country" | "state" | "city";
type SortDirection = "asc" | "desc";

const MAX_KEYWORDS = 50;

const GEO_TYPE_LABELS: Record<GeoType, string> = {
  country: "País",
  state: "Estado",
  city: "Cidade",
};

const GEO_SHORTCUTS: Record<GeoType, Array<{ label: string; id?: string }>> = {
  country: [{ label: "Brasil", id: "21167" }],
  state: [
    { label: "São Paulo", id: "21171" },
    { label: "Rio de Janeiro", id: "21175" },
    { label: "Minas Gerais", id: "21174" },
  ],
  city: [
    { label: "São Paulo, São Paulo, Brasil", id: "1031714" },
    { label: "Rio de Janeiro, Rio de Janeiro, Brasil", id: "1031745" },
    { label: "Curitiba, Paraná, Brasil", id: "1031713" },
  ],
};

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

export default function HomePage() {
  const [provider, setProvider] = useState<Provider>("meta");
  const [keyword, setKeyword] = useState("");
  const [googleKeywordInput, setGoogleKeywordInput] = useState("");
  const [googleKeywords, setGoogleKeywords] = useState<string[]>([]);
  const [geoType, setGeoType] = useState<GeoType>("city");
  const [geoChips, setGeoChips] = useState<string[]>([]);
  const [geoInput, setGeoInput] = useState("");
  const [geoOpen, setGeoOpen] = useState(false);
  const [geoSuggestionsRemote, setGeoSuggestionsRemote] = useState<GeoSuggestionItem[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [country, setCountry] = useState("BR");
  const [googleCountry, setGoogleCountry] = useState("BR");
  const [limit, setLimit] = useState(50);
  const [metaResults, setMetaResults] = useState<InterestItem[]>([]);
  const [discovery, setDiscovery] = useState<DiscoveryResult | null>(null);
  const [discoveryTab, setDiscoveryTab] = useState("Geral");
  const [tableWidthByProvider, setTableWidthByProvider] = useState<Record<Provider, number>>({ meta: 110, google: 220 });
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<StatusType>("info");
  const [lastQueryAt, setLastQueryAt] = useState("—");

  const canAddMoreKeywords = googleKeywords.length < MAX_KEYWORDS;
  const tableWidth = tableWidthByProvider[provider];
  const googleColumns = useMemo(() => buildGoogleTableColumns(), []);
  const metaColumns = useMemo(
    () => [
      { key: "name", label: "Nome" },
      { key: "audience_size", label: "Audiência" },
      { key: "type", label: "Tipo" },
      { key: "path", label: "Categoria" },
    ],
    []
  );

  const geoSuggestions = useMemo(() => {
    if (geoSuggestionsRemote.length > 0) return geoSuggestionsRemote;
    if (!geoInput.trim()) return GEO_SHORTCUTS[geoType];
    const query = geoInput.toLowerCase();
    return GEO_SHORTCUTS[geoType].filter((item) => item.label.toLowerCase().includes(query));
  }, [geoType, geoInput, geoSuggestionsRemote]);

  useEffect(() => {
    if (provider !== "google" || !geoInput.trim()) {
      setGeoSuggestionsRemote([]);
      setGeoLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(async () => {
      setGeoLoading(true);
      try {
        const remote = await suggestGoogleLocations({
          query: geoInput.trim(),
          country: googleCountry,
          geo_type: geoType,
          limit: 25,
        });
        if (!controller.signal.aborted) {
          setGeoSuggestionsRemote(remote);
        }
      } catch {
        if (!controller.signal.aborted) {
          setGeoSuggestionsRemote([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setGeoLoading(false);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [provider, geoInput, googleCountry, geoType]);

  useEffect(() => {
    setFavoriteIds(new Set(metaResults.filter((item) => isFavorite(item.id)).map((item) => item.id)));
  }, [metaResults]);

  function addGeoChip(value: string, id?: string) {
    const chip = geoValue(geoType, value, id);
    if (!geoChips.includes(chip)) {
      setGeoChips((prev) => [...prev, chip]);
    }
    setGeoInput("");
    setGeoOpen(false);
    setGeoSuggestionsRemote([]);
  }

  function removeGeoChip(chip: string) {
    setGeoChips((prev) => prev.filter((item) => item !== chip));
  }

  function addGoogleKeywordsFromText(raw: string, clearInput = true) {
    const parts = splitGoogleKeywords(raw);
    if (!parts.length) return;

    let limitReached = false;
    setGoogleKeywords((prev) => {
      const next = [...prev];
      const seen = new Set(next.map((item) => item.toLowerCase()));
      for (const part of parts) {
        if (next.length >= MAX_KEYWORDS) {
          limitReached = true;
          break;
        }
        const key = part.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        next.push(part);
      }
      return next;
    });

    if (limitReached) {
      setStatusType("warning");
      setStatusMessage(`Limite de ${MAX_KEYWORDS} palavras-chave atingido.`);
    }
    if (clearInput) {
      setGoogleKeywordInput("");
    }
  }

  function removeGoogleKeyword(value: string) {
    setGoogleKeywords((prev) => prev.filter((item) => item !== value));
  }

  function onSort(key: string) {
    if (sortColumn === key) {
      setSortDirection((direction) => (direction === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(key);
    setSortDirection("asc");
  }

  function getSortValue(item: InterestItem, key: string): string | number {
    if (key === "path") return (item.path ?? []).join(" ").toLowerCase();
    if (key.startsWith("month:")) return item.searches_mensais?.[key.replace("month:", "")] ?? -1;
    const value = (item as Record<string, unknown>)[key];
    if (typeof value === "number") return value;
    if (typeof value === "string") return value.toLowerCase();
    return "";
  }

  const activeItems = useMemo(() => {
    if (provider === "meta") return metaResults;
    if (!discovery) return [];
    return discoveryTab === "Geral" ? discovery.general : discovery.categories[discoveryTab] ?? [];
  }, [provider, metaResults, discovery, discoveryTab]);

  const sortedResults = useMemo(() => {
    const cloned = [...activeItems];
    if (!sortColumn) return cloned;
    cloned.sort((a, b) => {
      const av = getSortValue(a, sortColumn);
      const bv = getSortValue(b, sortColumn);
      const cmp =
        typeof av === "number" && typeof bv === "number"
          ? av - bv
          : String(av).localeCompare(String(bv), "pt-BR");
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return cloned;
  }, [activeItems, sortColumn, sortDirection]);

  const discoveryTabs = discovery ? ["Geral", ...Object.keys(discovery.categories)] : [];
  const emptyState = !loading && !errorMessage && sortedResults.length === 0;
  const locationSummary = geoChips.map(geoLabel).join(" · ");

  async function runGoogleDiscoverySearch(seedKeywords: string[]) {
    if (!seedKeywords.length) {
      setErrorMessage("Adicione ao menos uma palavra-chave.");
      return;
    }
    if (!geoChips.length) {
      setErrorMessage("Selecione ao menos uma localização para a descoberta.");
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setStatusMessage("Buscando ideias e categorizando resultados…");
    setDiscovery(null);

    try {
      const data = await searchGoogleDiscovery({
        keyword: seedKeywords[0] ?? "",
        keywords: seedKeywords,
        country: googleCountry,
        limit,
        locations: geoChips,
      });
      setDiscovery(data);
      setDiscoveryTab("Geral");
      setStatusType("info");
      setStatusMessage(
        data.general.length === 0
          ? "Nenhuma keyword encontrada."
          : `${data.general.length} keywords em ${Object.keys(data.categories).length} categorias.`
      );
      setLastQueryAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Falha ao consultar API.");
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    if (provider === "meta") {
      if (!keyword.trim()) {
        setErrorMessage("Informe uma keyword.");
        return;
      }
      setLoading(true);
      setMetaResults([]);
      try {
        const data = await searchMetaInterests({ keyword: keyword.trim(), country, limit });
        setMetaResults(data.results);
        setStatusType("info");
        setStatusMessage(data.results.length === 0 ? "Nenhum resultado encontrado." : `${data.results.length} resultados carregados.`);
        setLastQueryAt(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Falha ao consultar API.");
      } finally {
        setLoading(false);
      }
      return;
    }

    const pending = splitGoogleKeywords(googleKeywordInput);
    const kwList = [...googleKeywords];
    for (const part of pending) {
      if (!kwList.some((item) => item.toLowerCase() === part.toLowerCase())) {
        kwList.push(part);
      }
    }
    if (pending.length) {
      setGoogleKeywords(kwList);
      setGoogleKeywordInput("");
    }
    await runGoogleDiscoverySearch(kwList);
  }

  async function onBroaden(term: string) {
    const next = [...googleKeywords];
    if (!next.some((item) => item.toLowerCase() === term.toLowerCase())) {
      if (next.length >= MAX_KEYWORDS) {
        setStatusType("warning");
        setStatusMessage(`Limite de ${MAX_KEYWORDS} palavras-chave atingido.`);
        return;
      }
      next.push(term);
      setGoogleKeywords(next);
    }
    await runGoogleDiscoverySearch(next);
  }

  function onDownloadXlsx() {
    if (!discovery) return;
    downloadDiscoveryXlsx(discovery);
  }

  function onDownloadCsv() {
    if (!discovery) return;
    const items = discoveryTab === "Geral" ? discovery.general : discovery.categories[discoveryTab] ?? [];
    const safeTab = discoveryTab.replace(/[^\w\- ]+/g, "").trim() || "geral";
    downloadDiscoveryCsv(items, discoveryExportFilename(discovery, `${safeTab}.csv`));
  }

  function onToggleFavorite(item: InterestItem) {
    const now = toggleFavorite(item);
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (now) next.add(item.id);
      else next.delete(item.id);
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

  return (
    <div className="shell">
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

      <section className="hero">
        <div className="crumb mono">
          <span className="slash">/</span>
          <span>automações</span>
          <span className="slash">/</span>
          <span className="here">keywords-p12</span>
        </div>
        <h1 className="hero-title display">
          Plataforma de Estudo
          <br />
          <span className="dim">de Keywords.</span>
        </h1>
        <p className="hero-sub">
          Pesquisa Meta Ads e descoberta Google Ads com categorização automática, ampliação de busca e exportação por aba.
        </p>
        <div className="hero-stats">
          {[
            {
              label: "Resultados",
              value: (
                <>
                  <span className="accent">{pad(provider === "google" ? discovery?.general.length ?? 0 : metaResults.length)}</span>
                  <span style={{ color: "var(--text-faint)" }}> / {pad(limit)}</span>
                </>
              ),
            },
            { label: "Provedor", value: provider === "meta" ? "META.ADS" : "GOOGLE.ADS" },
            {
              label: "Categorias",
              value: <span className="accent">{pad(provider === "google" ? Object.keys(discovery?.categories ?? {}).length : 0)}</span>,
            },
            { label: "Última busca", value: <span style={{ fontSize: 16 }}>{lastQueryAt}</span> },
          ].map(({ label, value }) => (
            <div className="hero-stat" key={label}>
              <div className="hero-stat-label mono">{label}</div>
              <div className="hero-stat-value mono">{value}</div>
            </div>
          ))}
        </div>
      </section>

      <nav className="tabs" aria-label="Provedor">
        {(["meta", "google"] as Provider[]).map((item, index) => (
          <button
            key={item}
            type="button"
            className={`tab ${provider === item ? "is-active" : ""}`}
            onClick={() => {
              setProvider(item);
              setMetaResults([]);
              setDiscovery(null);
              setErrorMessage(null);
              setStatusMessage(null);
            }}
          >
            <span className="tab-idx">[{String(index + 1).padStart(2, "0")}]</span>
            <span>{item === "meta" ? "Meta Ads" : "Google Ads"}</span>
          </button>
        ))}
      </nav>

      <form className={`panel search ${provider === "google" ? "search-google" : ""}`} onSubmit={onSubmit}>
        <span className="panel-label mono">
          <span className="accent">●</span> {provider === "google" ? "descobrir palavras-chave" : "busca / parâmetros"}
        </span>

        {provider === "meta" ? (
          <div className="field field-keyword">
            <label htmlFor="keyword">
              <span className="idx">01</span> Keyword
            </label>
            <input
              id="keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="emagrecimento, fitness, skincare…"
              autoComplete="off"
            />
          </div>
        ) : (
          <div className="field field-google">
            <label htmlFor="google-kw-input">
              <span className="idx">01</span> Produtos / serviços relacionados
            </label>
            <div className="chips-box">
              {googleKeywords.map((item) => (
                <span className="chip-kw mono" key={item}>
                  {item}
                  <button type="button" onClick={() => removeGoogleKeyword(item)} aria-label={`Remover ${item}`}>
                    ×
                  </button>
                </span>
              ))}
              <input
                id="google-kw-input"
                value={googleKeywordInput}
                onChange={(event) => setGoogleKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addGoogleKeywordsFromText(googleKeywordInput);
                  }
                }}
                onPaste={(event) => {
                  const text = event.clipboardData.getData("text");
                  if (!text) return;
                  event.preventDefault();
                  addGoogleKeywordsFromText(text, false);
                }}
                placeholder={
                  canAddMoreKeywords
                    ? "Digite, cole com vírgula ou pressione Enter…"
                    : `Limite de ${MAX_KEYWORDS} atingido`
                }
                disabled={!canAddMoreKeywords}
                autoComplete="off"
              />
            </div>
            <div className="chip-counter mono">
              {pad(googleKeywords.length, 2)} / {MAX_KEYWORDS} palavras-chave
            </div>

            <div className="geo-section">
              <div className="geo-label mono">Localização</div>
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="google-country">
                  <span className="idx">País</span> Contexto da busca
                </label>
                <select id="google-country" value={googleCountry} onChange={(event) => setGoogleCountry(event.target.value.toUpperCase())}>
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
                      setGeoOpen(false);
                      setGeoSuggestionsRemote([]);
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
                    onChange={(event) => {
                      setGeoInput(event.target.value);
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
                      <div className="geo-option">Digite para buscar um local no Google Ads.</div>
                    )}
                    {!geoLoading &&
                      geoSuggestions.map((item) => {
                        if ("id" in item && "target_type" in item) {
                          return (
                            <button
                              key={`${item.id}-${item.name}`}
                              type="button"
                              className="geo-option"
                              onMouseDown={() => addGeoChip(item.name, item.id)}
                            >
                              {item.name} · {item.target_type} · {item.country_code}
                            </button>
                          );
                        }
                        return (
                          <button
                            key={item.label}
                            type="button"
                            className="geo-option"
                            onMouseDown={() => addGeoChip(item.label, item.id)}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {provider === "meta" && (
          <div className="field">
            <label htmlFor="country">
              <span className="idx">02</span> País
            </label>
            <select id="country" value={country} onChange={(event) => setCountry(event.target.value.toUpperCase())}>
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
          <input id="limit" type="number" min={1} max={100} value={limit} onChange={(event) => setLimit(Number(event.target.value))} />
        </div>

        <div className="submit-wrap">
          <button type="submit" className={`btn-primary ${loading ? "is-loading" : ""}`} disabled={loading}>
            {loading ? "Processando" : provider === "google" ? "Descobrir" : "Buscar"}
          </button>
        </div>
      </form>

      {errorMessage && <div className="status error mono">{errorMessage}</div>}
      {statusMessage && <div className={`status ${statusType} mono`}>{statusMessage}</div>}

      {provider === "google" && discovery && (
        <>
          <div className="study-header">
            <h2 className="study-title display">Descoberta Google Ads</h2>
            <div style={{ display: "flex", gap: 8 }}>
              <button type="button" className="btn-download" onClick={onDownloadCsv}>
                Baixar CSV
              </button>
              <button type="button" className="btn-download" onClick={onDownloadXlsx}>
                Baixar XLSX
              </button>
            </div>
          </div>
          <div className="mono" style={{ marginBottom: 12, color: "var(--text-dim)" }}>
            Local: {locationSummary || "—"} · Seeds: {discovery.seed_keywords.join("; ")}
          </div>
          {discovery.broaden_suggestions.length > 0 && (
            <div className="geo-section" style={{ marginBottom: 16 }}>
              <div className="geo-label mono">Ampliar sua pesquisa</div>
              <div className="geo-chips-row">
                {discovery.broaden_suggestions.map((term) => (
                  <button key={term} type="button" className="geo-type-btn" onClick={() => onBroaden(term)}>
                    + {term}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="study-tabs">
            {discoveryTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                className={`study-tab mono ${discoveryTab === tab ? "is-active" : ""}`}
                onClick={() => setDiscoveryTab(tab)}
              >
                {tab}
                {tab !== "Geral" && (
                  <span style={{ color: "var(--text-faint)", marginLeft: 6, fontSize: 10 }}>
                    ({discovery.categories[tab]?.length ?? 0})
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {(sortedResults.length > 0 || loading) && (
        <>
          <div className="ribbon mono">
            <div className="left">
              <span className="dot" />
              <span>{provider === "google" ? `google_discovery · ${discoveryTab}` : "meta_interests"}</span>
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
              max={260}
              step={10}
              value={tableWidth}
              onChange={(event) =>
                setTableWidthByProvider((prev) => ({ ...prev, [provider]: Number(event.target.value) }))
              }
            />
            <div className="note">clique nos títulos para ordenar</div>
          </div>

          <section className="table-shell">
            <div className="table-head-meta mono">
              <span>{pad(sortedResults.length, 4)} rows</span>
              {provider === "google" && discovery && (
                <div className="table-head-actions">
                  <button type="button" className="btn-download" onClick={onDownloadCsv} style={{ padding: "6px 14px", fontSize: 11 }}>
                    CSV
                  </button>
                  <button type="button" className="btn-download" onClick={onDownloadXlsx} style={{ padding: "6px 14px", fontSize: 11 }}>
                    XLSX
                  </button>
                </div>
              )}
            </div>
            <div className="table-scroll">
              {loading ? (
                <div className="state">
                  <div className="spinner" />
                  <div className="state-tag mono">processando</div>
                  <p className="state-title">{provider === "google" ? "Descobrindo palavras-chave…" : "Consultando API…"}</p>
                </div>
              ) : (
                <table style={{ minWidth: `${tableWidth}%` }}>
                  <thead>
                    <tr>
                      {(provider === "meta" ? metaColumns : googleColumns).map((column) => (
                        <th key={column.key} className="sortable mono" onClick={() => onSort(column.key)} title="Clique para ordenar">
                          {column.label}
                          {sortColumn === column.key && <span className="arrow">{sortDirection === "asc" ? "↑" : "↓"}</span>}
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
                            <td>
                              {item.path?.length > 0 ? item.path.map((path) => <span className="tag mono" key={path}>{path}</span>) : <span className="muted">—</span>}
                            </td>
                            <td>
                              <div className="row-actions">
                                <button type="button" className="btn-ghost mono" onClick={() => copyText(item.name, "Nome")}>
                                  Copiar
                                </button>
                                <button
                                  type="button"
                                  className={`btn-ghost mono ${favoriteIds.has(item.id) ? "is-active" : ""}`}
                                  onClick={() => onToggleFavorite(item)}
                                >
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
                            {GOOGLE_MONTH_COLUMNS.map((month) => (
                              <td key={`${item.id}-${month}`} className="num mono">
                                {item.searches_mensais?.[month] ?? "—"}
                              </td>
                            ))}
                            <td>
                              <div className="row-actions">
                                <button type="button" className="btn-ghost mono" onClick={() => copyText(item.name, "Keyword")}>
                                  Copiar
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

      <footer className="foot mono">
        <span>© P12 Digital · uso interno</span>
        <span>keywords-p12 · edge runtime</span>
      </footer>
    </div>
  );
}
