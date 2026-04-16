export type InterestItem = {
  id: string;
  name: string;
  audience_size: number | null;
  type: string | null;
  path: string[];
  media_pesquisas?: number | null;
  mudanca_tres_meses?: string | null;
  mudanca_ano_anterior?: string | null;
  concorrencia?: string | null;
  grau_concorrencia?: number | null;
  menor_lance_topo?: number | null;
  maior_lance_topo?: number | null;
  searches_mensais?: Record<string, number>;
};

export type SearchPayload = {
  keyword: string;
  keywords?: string[];
  country: string;
  limit: number;
};

export type SearchResponse = {
  results: InterestItem[];
};
