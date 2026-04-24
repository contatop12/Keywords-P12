"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { searchGoogleKeywords, searchMetaInterests } from "../lib/api";
import { isFavorite, toggleFavorite } from "../lib/storage";
import { InterestItem } from "../lib/types";

type StatusType = "info" | "error" | "warning";
type Provider = "meta" | "google";
type SortDirection = "asc" | "desc";
type TableColumn = { key: string; label: string };

function formatAudience(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatMoney(value?: number | null): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2
  }).format(value);
}

function pad(n: number, size = 3): string {
  return String(n).padStart(size, "0");
}

export default function HomePage() {
  const [provider, setProvider] = useState<Provider>("meta");
  const [keyword, setKeyword] = useState("");
  const [googleKeywordInput, setGoogleKeywordInput] = useState("");
  const [googleKeywords, setGoogleKeywords] = useState<string[]>([]);
  const [country, setCountry] = useState("BR");
  const [limit, setLimit] = useState(50);
  const [results, setResults] = useState<InterestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusType, setStatusType] = useState<StatusType>("info");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [tableWidthByProvider, setTableWidthByProvider] = useState<Record<Provider, number>>({
    meta: 110,
    google: 180
  });
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");
  const [lastQueryAt, setLastQueryAt] = useState<string>("—");

  const emptyState = useMemo(
    () => !loading && !errorMessage && results.length === 0,
    [loading, errorMessage, results.length]
  );

  const googleMonthHeaders = useMemo(() => {
    const ordered: string[] = [];
    for (const item of results) {
      const entries = item.searches_mensais ? Object.keys(item.searches_mensais) : [];
      for (const header of entries) {
        if (!ordered.includes(header)) ordered.push(header);
      }
    }
    return ordered;
  }, [results]);

  const canAddMoreGoogleKeywords = googleKeywords.length < 10;
  const tableWidth = tableWidthByProvider[provider];

  const metaColumns = useMemo<TableColumn[]>(
    () => [
      { key: "name", label: "Nome" },
      { key: "audience_size", label: "Audiência" },
      { key: "type", label: "Tipo" },
      { key: "path", label: "Categoria" }
    ],
    []
  );

  const googleColumns = useMemo<TableColumn[]>(
    () => [
      { key: "name", label: "Palavra-Chave" },
      { key: "media_pesquisas", label: "Média Pesquisas" },
      { key: "mudanca_tres_meses", label: "Δ 3m" },
      { key: "mudanca_ano_anterior", label: "Δ 12m" },
      { key: "concorrencia", label: "Concorrência" },
      { key: "grau_concorrencia", label: "Grau" },
      { key: "menor_lance_topo", label: "Lance mín. topo" },
      { key: "maior_lance_topo", label: "Lance máx. topo" },
      ...googleMonthHeaders.map((header) => ({ key: `month:${header}`, label: header }))
    ],
    [googleMonthHeaders]
  );

  function onAdjustTableWidth(value: number) {
    setTableWidthByProvider((prev) => ({ ...prev, [provider]: value }));
  }

  function onSort(columnKey: string) {
    if (sortColumn === columnKey) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setSortColumn(columnKey);
    setSortDirection("asc");
  }

  function getSortValue(item: InterestItem, columnKey: string): string | number {
    if (columnKey === "path") return (item.path ?? []).join(" ").toLowerCase();
    if (columnKey.startsWith("month:")) {
      const monthKey = columnKey.replace("month:", "");
      return item.searches_mensais?.[monthKey] ?? -1;
    }
    const value = (item as Record<string, unknown>)[columnKey];
    if (typeof value === "number") return value;
    if (typeof value === "string") return value.toLowerCase();
    return "";
  }

  const sortedResults = useMemo(() => {
    const cloned = [...results];
    if (!sortColumn) return cloned;
    cloned.sort((a, b) => {
      const aValue = getSortValue(a, sortColumn);
      const bValue = getSortValue(b, sortColumn);
      let comparison = 0;
      if (typeof aValue === "number" && typeof bValue === "number") {
        comparison = aValue - bValue;
      } else {
        comparison = String(aValue).localeCompare(String(bValue), "pt-BR");
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
    return cloned;
  }, [results, sortColumn, sortDirection]);

  function normalizeKeywordInput(value: string): string {
    return value.replace(/\s+/g, " ").trim();
  }

  function addGoogleKeyword(rawValue: string) {
    const normalized = normalizeKeywordInput(rawValue);
    if (!normalized) return;
    if (!canAddMoreGoogleKeywords) {
      setStatusType("warning");
      setStatusMessage("Limite de 10 palavras-chave atingido para Google Ads.");
      return;
    }
    const alreadyExists = googleKeywords.some((item) => item.toLowerCase() === normalized.toLowerCase());
    if (alreadyExists) return;
    setGoogleKeywords((prev) => [...prev, normalized]);
    setGoogleKeywordInput("");
  }

  function removeGoogleKeyword(value: string) {
    setGoogleKeywords((prev) => prev.filter((item) => item !== value));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setStatusMessage(null);

    const googleKeywordsToUse =
      provider === "google"
        ? [...googleKeywords, normalizeKeywordInput(googleKeywordInput)].filter(Boolean)
        : [];

    if (provider === "meta" && !keyword.trim()) {
      setErrorMessage("Informe uma keyword para pesquisar.");
      return;
    }
    if (provider === "google" && googleKeywordsToUse.length === 0) {
      setErrorMessage("Adicione ao menos uma palavra-chave para buscar no Google Ads.");
      return;
    }

    setLoading(true);
    try {
      const searchFn = provider === "meta" ? searchMetaInterests : searchGoogleKeywords;
      const data = await searchFn({
        keyword: provider === "meta" ? keyword.trim() : googleKeywordsToUse[0] ?? "",
        keywords: provider === "google" ? googleKeywordsToUse.slice(0, 10) : undefined,
        country,
        limit
      });
      setResults(data.results);
      setLastQueryAt(
        new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      );
      if (data.results.length === 0) {
        setStatusType("warning");
        setStatusMessage(
          provider === "meta"
            ? "Nenhum direcionamento Meta encontrado para esta keyword."
            : "Nenhuma keyword Google relevante encontrada para esta busca."
        );
      } else {
        setStatusType("info");
        setStatusMessage(`${data.results.length} resultados carregados.`);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Falha ao consultar API.");
    } finally {
      setLoading(false);
    }
  }

  async function copyText(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setStatusType("info");
    setStatusMessage(`${label} copiado para a área de transferência.`);
  }

  function onToggleFavorite(item: InterestItem) {
    const nowFavorite = toggleFavorite(item);
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (nowFavorite) next.add(item.id);
      else next.delete(item.id);
      return next;
    });
    setStatusType("info");
    setStatusMessage(nowFavorite ? "Interesse salvo." : "Interesse removido dos salvos.");
  }

  useEffect(() => {
    const ids = new Set(results.filter((item) => isFavorite(item.id)).map((item) => item.id));
    setFavoriteIds(ids);
  }, [results]);

  const savedCount = favoriteIds.size;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>P12 / Keywords Console</span>
        </div>
        <div className="topbar-meta">
          <span className="signal-dot">API online</span>
          <span className="brand-divider">·</span>
          <span>v0.1.0</span>
          <span className="brand-divider">·</span>
          <span>BR/PT</span>
        </div>
      </header>

      <section className="hero">
        <div className="crumb mono">
          <span className="slash">/</span>
          <span>automações ativas</span>
          <span className="slash">/</span>
          <span className="here">keywords-p12</span>
        </div>
        <h1 className="hero-title">
          Pesquisa de interesses<br />
          <span className="dim">e ideias de keyword.</span>
        </h1>
        <p className="hero-sub">
          Console interno P12 para cruzamento de direcionamentos Meta Ads com ideias Google Ads.
          Busca ilimitada, filtros por país, enriquecimento de audiência e exportação rápida.
        </p>

        <div className="hero-stats">
          <div className="hero-stat">
            <div className="hero-stat-label">Resultados</div>
            <div className="hero-stat-value mono">
              <span className="accent">{pad(results.length)}</span>
              <span style={{ color: "var(--text-faint)" }}> / {pad(limit)}</span>
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">Provedor</div>
            <div className="hero-stat-value mono">
              {provider === "meta" ? "META.ADS" : "GOOGLE.ADS"}
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">Salvos</div>
            <div className="hero-stat-value mono">
              <span className="accent">{pad(savedCount)}</span>
            </div>
          </div>
          <div className="hero-stat">
            <div className="hero-stat-label">Última busca</div>
            <div className="hero-stat-value mono" style={{ fontSize: 16 }}>{lastQueryAt}</div>
          </div>
        </div>
      </section>

      <nav className="tabs" aria-label="Provedor de busca">
        <button
          type="button"
          className={`tab ${provider === "meta" ? "is-active" : ""}`}
          onClick={() => setProvider("meta")}
        >
          <span className="tab-idx">[01]</span>
          <span>Meta Ads</span>
        </button>
        <button
          type="button"
          className={`tab ${provider === "google" ? "is-active" : ""}`}
          onClick={() => setProvider("google")}
        >
          <span className="tab-idx">[02]</span>
          <span>Google Ads</span>
        </button>
      </nav>

      <form
        className={`panel search ${provider === "google" ? "search-google" : ""}`}
        onSubmit={onSubmit}
      >
        <span className="panel-label">
          <span className="accent">●</span> query / parameters
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
            <label htmlFor="google-keyword-input">
              <span className="idx">01</span> Produtos / serviços diretamente relacionados
            </label>
            <div className="chips-box">
              {googleKeywords.map((item) => (
                <span className="chip-kw mono" key={item}>
                  {item}
                  <button
                    type="button"
                    onClick={() => removeGoogleKeyword(item)}
                    aria-label={`Remover ${item}`}
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                id="google-keyword-input"
                value={googleKeywordInput}
                onChange={(event) => setGoogleKeywordInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === ",") {
                    event.preventDefault();
                    addGoogleKeyword(googleKeywordInput);
                  }
                }}
                placeholder={
                  canAddMoreGoogleKeywords
                    ? "Digite e pressione Enter…"
                    : "Limite de 10 atingido"
                }
                disabled={!canAddMoreGoogleKeywords}
                autoComplete="off"
              />
            </div>
            <div className="chip-counter">
              {pad(googleKeywords.length, 2)} / 10 palavras-chave adicionadas
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="country">
            <span className="idx">02</span> País
          </label>
          <select
            id="country"
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
          >
            <option value="BR">BR — Brasil</option>
            <option value="US">US — United States</option>
            <option value="PT">PT — Portugal</option>
            <option value="MX">MX — México</option>
          </select>
        </div>

        <div className="field">
          <label htmlFor="limit">
            <span className="idx">03</span> Limite
          </label>
          <input
            id="limit"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
        </div>

        <div className="submit-wrap">
          <button
            type="submit"
            className={`btn-primary ${loading ? "is-loading" : ""}`}
            disabled={loading}
          >
            {loading ? "Processando" : "Executar busca"}
          </button>
        </div>
      </form>

      <div className="ribbon">
        <div className="left">
          <span className="dot" />
          <span>Uso interno — buscas ilimitadas</span>
        </div>
        <div className="right">
          <span>
            Fonte:{" "}
            {provider === "meta"
              ? "Meta Ads API · direcionamento detalhado"
              : "Google Ads API · keyword ideas"}
          </span>
        </div>
      </div>

      <div className="controls">
        <label htmlFor="table-width-range" className="controls-block">
          <span>Largura tabela</span>
          <span className="value">{tableWidth}%</span>
        </label>
        <input
          id="table-width-range"
          className="range"
          type="range"
          min={100}
          max={220}
          step={10}
          value={tableWidth}
          onChange={(event) => onAdjustTableWidth(Number(event.target.value))}
        />
        <div className="note">clique nos títulos para ordenar</div>
      </div>

      {errorMessage ? <div className="status error mono">{errorMessage}</div> : null}
      {statusMessage ? <div className={`status ${statusType} mono`}>{statusMessage}</div> : null}

      <section className="table-shell" style={{ marginTop: 16 }}>
        <div className="table-head-meta">
          <span>dataset · {provider === "meta" ? "meta_interests" : "google_keywords"}</span>
          <span className="total">{pad(sortedResults.length, 4)} rows</span>
        </div>

        <div className="table-scroll">
          {loading ? (
            <div className="state">
              <div className="scan" aria-hidden>
                <span /><span /><span /><span /><span />
              </div>
              <div className="state-tag">streaming</div>
              <p className="state-title">
                {provider === "meta"
                  ? "Consultando Meta Ads API…"
                  : "Consultando Google Ads API…"}
              </p>
            </div>
          ) : emptyState ? (
            <div className="state">
              <div className="state-tag">idle</div>
              <p className="state-title">
                Nenhum resultado carregado. Execute uma busca para começar.
              </p>
            </div>
          ) : (
            <table style={{ minWidth: `${tableWidth}%` }}>
              <thead>
                <tr>
                  {(provider === "meta" ? metaColumns : googleColumns).map((column) => (
                    <th
                      key={column.key}
                      className="sortable"
                      onClick={() => onSort(column.key)}
                      title="Clique para ordenar"
                    >
                      {column.label}
                      {sortColumn === column.key ? (
                        <span className="arrow">{sortDirection === "asc" ? "↑" : "↓"}</span>
                      ) : null}
                    </th>
                  ))}
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((item) => (
                  <tr key={item.id}>
                    {provider === "meta" ? (
                      <>
                        <td className="name">{item.name || "Sem nome"}</td>
                        <td className="num">{formatAudience(item.audience_size)}</td>
                        <td>
                          {item.type ? <span className="type-pill">{item.type}</span> : <span className="muted">—</span>}
                        </td>
                        <td>
                          {item.path.length > 0 ? (
                            item.path.map((pathPart) => (
                              <span className="tag" key={`${item.id}-${pathPart}`}>
                                {pathPart}
                              </span>
                            ))
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => copyText(item.name, "Nome")}
                            >
                              Copiar nome
                            </button>
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => copyText(item.id, "ID")}
                            >
                              Copiar ID
                            </button>
                            <button
                              type="button"
                              className={`btn-ghost ${favoriteIds.has(item.id) ? "is-active" : ""}`}
                              onClick={() => onToggleFavorite(item)}
                            >
                              {favoriteIds.has(item.id) ? "Salvo" : "Salvar"}
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="name">{item.name || "Sem nome"}</td>
                        <td className="num">{formatAudience(item.audience_size)}</td>
                        <td className="num">{item.mudanca_tres_meses ?? "—"}</td>
                        <td className="num">{item.mudanca_ano_anterior ?? "—"}</td>
                        <td>{item.concorrencia ?? item.type ?? <span className="muted">—</span>}</td>
                        <td className="num">{item.grau_concorrencia ?? "—"}</td>
                        <td className="num">{formatMoney(item.menor_lance_topo)}</td>
                        <td className="num">{formatMoney(item.maior_lance_topo)}</td>
                        {googleMonthHeaders.map((monthLabel) => (
                          <td key={`${item.id}-${monthLabel}`} className="num">
                            {item.searches_mensais?.[monthLabel] ?? "—"}
                          </td>
                        ))}
                        <td>
                          <div className="row-actions">
                            <button
                              type="button"
                              className="btn-ghost"
                              onClick={() => copyText(item.name, "Palavra-chave")}
                            >
                              Copiar
                            </button>
                            <button
                              type="button"
                              className={`btn-ghost ${favoriteIds.has(item.id) ? "is-active" : ""}`}
                              onClick={() => onToggleFavorite(item)}
                            >
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

      <footer className="foot">
        <span>© P12 Digital · uso interno</span>
        <span>keywords-p12 · edge runtime</span>
      </footer>
    </div>
  );
}
