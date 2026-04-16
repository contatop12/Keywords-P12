"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import { searchGoogleKeywords, searchMetaInterests } from "../lib/api";
import { isFavorite, toggleFavorite } from "../lib/storage";
import { InterestItem } from "../lib/types";

type StatusType = "info" | "error" | "warning";
type Provider = "meta" | "google";
type SortDirection = "asc" | "desc";
type TableColumn = { key: string; label: string };

function formatAudience(value: number | null): string {
  if (value === null || value === undefined) {
    return "N/A";
  }
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatMoney(value?: number | null): string {
  if (value === null || value === undefined) {
    return "N/A";
  }
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2
  }).format(value);
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

  const emptyState = useMemo(
    () => !loading && !errorMessage && results.length === 0,
    [loading, errorMessage, results.length]
  );
  const googleMonthHeaders = useMemo(() => {
    const ordered: string[] = [];
    for (const item of results) {
      const entries = item.searches_mensais ? Object.keys(item.searches_mensais) : [];
      for (const header of entries) {
        if (!ordered.includes(header)) {
          ordered.push(header);
        }
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
      { key: "media_pesquisas", label: "Média de Pesquisas" },
      { key: "mudanca_tres_meses", label: "Mudança em três meses" },
      {
        key: "mudanca_ano_anterior",
        label: "Mudança em relação ao mesmo mês do ano anterior"
      },
      { key: "concorrencia", label: "Concorrência" },
      { key: "grau_concorrencia", label: "Grau de concorrência" },
      {
        key: "menor_lance_topo",
        label: "Menores valores topo da pesquisa"
      },
      {
        key: "maior_lance_topo",
        label: "Maiores valores topo da pesquisa"
      },
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
    if (columnKey === "path") {
      return (item.path ?? []).join(" ").toLowerCase();
    }
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
    const alreadyExists = googleKeywords.some(
      (item) => item.toLowerCase() === normalized.toLowerCase()
    );
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
    setStatusMessage(`${label} copiado para a area de transferencia.`);
  }

  function onToggleFavorite(item: InterestItem) {
    const nowFavorite = toggleFavorite(item);
    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (nowFavorite) {
        next.add(item.id);
      } else {
        next.delete(item.id);
      }
      return next;
    });
    setStatusType("info");
    setStatusMessage(nowFavorite ? "Interesse salvo." : "Interesse removido dos salvos.");
  }

  useEffect(() => {
    const ids = new Set(results.filter((item) => isFavorite(item.id)).map((item) => item.id));
    setFavoriteIds(ids);
  }, [results]);

  return (
    <main>
      <h1 className="title">Ads Keywords Finder</h1>
      <p className="subtitle">
        Pesquise direcionamentos no Meta Ads e ideias de keyword no Google Ads em uma unica ferramenta.
      </p>

      <section className="tabs-row">
        <button
          type="button"
          className={`tab-btn ${provider === "meta" ? "active" : ""}`}
          onClick={() => setProvider("meta")}
        >
          Meta Ads
        </button>
        <button
          type="button"
          className={`tab-btn ${provider === "google" ? "active" : ""}`}
          onClick={() => setProvider("google")}
        >
          Google Ads
        </button>
      </section>

      <form className={`card search-panel ${provider === "google" ? "search-panel-google" : ""}`} onSubmit={onSubmit}>
        {provider === "meta" ? (
          <div className="field">
            <label htmlFor="keyword">Keyword</label>
            <input
              id="keyword"
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Ex.: emagrecimento, fitness, skincare..."
            />
          </div>
        ) : (
          <div className="field google-keyword-field">
            <label htmlFor="google-keyword-input">
              Insira produtos ou serviços diretamente relacionados à sua empresa
            </label>
            <div className="google-keyword-box">
              {googleKeywords.map((item) => (
                <span className="google-keyword-chip" key={item}>
                  {item}
                  <button
                    type="button"
                    className="chip-remove-btn"
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
                    ? "Digite uma palavra-chave e pressione Enter"
                    : "Limite de 10 palavras-chave atingido"
                }
                disabled={!canAddMoreGoogleKeywords}
              />
              <button
                type="button"
                className="add-google-keyword-btn"
                onClick={() => addGoogleKeyword(googleKeywordInput)}
                disabled={!canAddMoreGoogleKeywords}
              >
                + Adicionar outra palavra-chave
              </button>
            </div>
            <small>{googleKeywords.length} / 10 palavras-chave adicionadas</small>
          </div>
        )}

        <div className="field country-field">
          <label htmlFor="country">Pais</label>
          <select
            id="country"
            value={country}
            onChange={(event) => setCountry(event.target.value.toUpperCase())}
          >
            <option value="BR">BR</option>
            <option value="US">US</option>
            <option value="PT">PT</option>
            <option value="MX">MX</option>
          </select>
        </div>

        <div className="field limit-field">
          <label htmlFor="limit">Limite</label>
          <input
            id="limit"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
        </div>

        <div className="field submit-field" style={{ alignSelf: "end" }}>
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? "Searching..." : "Search"}
          </button>
        </div>
      </form>

      <div className="meta-bar">
        <span>Uso interno: buscas ilimitadas habilitadas.</span>
        <span>
          {provider === "meta"
            ? "Fonte: Meta Ads API (direcionamento detalhado)."
            : "Fonte: Google Ads API (keyword ideas)."}
        </span>
      </div>

      <div className="table-controls">
        <label htmlFor="table-width-range">
          Largura da tabela ({provider === "meta" ? "Meta Ads" : "Google Ads"}): {tableWidth}%
        </label>
        <input
          id="table-width-range"
          type="range"
          min={100}
          max={220}
          step={10}
          value={tableWidth}
          onChange={(event) => onAdjustTableWidth(Number(event.target.value))}
        />
        <span>Ordene clicando nos títulos das colunas.</span>
      </div>

      {errorMessage ? <div className="status error">{errorMessage}</div> : null}
      {statusMessage ? <div className={`status ${statusType}`}>{statusMessage}</div> : null}

      <section className="card table-wrap" style={{ padding: "0.4rem 0.6rem" }}>
        <p className="table-scroll-hint">Role horizontalmente para visualizar todas as colunas.</p>
        {loading ? (
          <div className="empty-box">
            {provider === "meta"
              ? "Buscando direcionamentos na Meta API..."
              : "Buscando ideias de keyword na Google Ads API..."}
          </div>
        ) : emptyState ? (
          <div className="empty-box">Nenhum resultado exibido. Faça uma busca para comecar.</div>
        ) : (
          <table style={{ minWidth: `${tableWidth}%` }}>
            <thead>
              {provider === "meta" ? (
                <tr>
                  {metaColumns.map((column) => (
                    <th
                      key={column.key}
                      className="sortable-th"
                      onClick={() => onSort(column.key)}
                      title="Clique para ordenar"
                    >
                      {column.label}
                      {sortColumn === column.key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ))}
                  <th>Acoes</th>
                </tr>
              ) : (
                <tr>
                  {googleColumns.map((column) => (
                    <th
                      key={column.key}
                      className="sortable-th"
                      onClick={() => onSort(column.key)}
                      title="Clique para ordenar"
                    >
                      {column.label}
                      {sortColumn === column.key ? (sortDirection === "asc" ? " ↑" : " ↓") : ""}
                    </th>
                  ))}
                  <th>Ações</th>
                </tr>
              )}
            </thead>
            <tbody>
              {sortedResults.map((item) => (
                <tr key={item.id}>
                  {provider === "meta" ? (
                    <>
                      <td>{item.name || "Sem nome"}</td>
                      <td>{formatAudience(item.audience_size)}</td>
                      <td>{item.type ?? "N/A"}</td>
                      <td>
                        {item.path.length > 0
                          ? item.path.map((pathPart) => (
                              <span className="chip" key={`${item.id}-${pathPart}`}>
                                {pathPart}
                              </span>
                            ))
                          : "N/A"}
                      </td>
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="small-btn"
                            onClick={() => copyText(item.name, "Nome")}
                          >
                            Copiar nome
                          </button>
                          <button
                            type="button"
                            className="small-btn"
                            onClick={() => copyText(item.id, "ID")}
                          >
                            Copiar ID
                          </button>
                          <button
                            type="button"
                            className="small-btn"
                            onClick={() => onToggleFavorite(item)}
                          >
                            {favoriteIds.has(item.id) ? "Remover salvo" : "Salvar"}
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{item.name || "Sem nome"}</td>
                      <td>{formatAudience(item.audience_size)}</td>
                      <td>{item.mudanca_tres_meses ?? "N/A"}</td>
                      <td>{item.mudanca_ano_anterior ?? "N/A"}</td>
                      <td>{item.concorrencia ?? item.type ?? "N/A"}</td>
                      <td>{item.grau_concorrencia ?? "N/A"}</td>
                      <td>{formatMoney(item.menor_lance_topo)}</td>
                      <td>{formatMoney(item.maior_lance_topo)}</td>
                      {googleMonthHeaders.map((monthLabel) => (
                        <td key={`${item.id}-${monthLabel}`}>
                          {item.searches_mensais?.[monthLabel] ?? "N/A"}
                        </td>
                      ))}
                      <td>
                        <div className="actions">
                          <button
                            type="button"
                            className="small-btn"
                            onClick={() => copyText(item.name, "Palavra-chave")}
                          >
                            Copiar keyword
                          </button>
                          <button
                            type="button"
                            className="small-btn"
                            onClick={() => onToggleFavorite(item)}
                          >
                            {favoriteIds.has(item.id) ? "Remover salvo" : "Salvar"}
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
      </section>
    </main>
  );
}
