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
  locations?: string[];
};

export type SearchResponse = {
  results: InterestItem[];
};

export type GeoSuggestionItem = {
  id: string;
  name: string;
  country_code: string;
  target_type: string;
};

export type AdGroup = {
  nome: string;
  palavras_positivas: string[];
  palavras_negativas: string[];
  extensoes: { sitelinks: string[]; callouts: string[] };
};

export type StudyResult = {
  id: string;
  created_at: string;
  seed_keywords: string[];
  locations: string[];
  country: string;
  general: InterestItem[];
  categories: Record<string, InterestItem[]>;
  insights: string[];
  ad_groups: Record<string, AdGroup>;
};

export type StudyMeta = {
  id: string;
  created_at: string;
  seed_keywords: string;
  locations: string;
  country: string;
  name: string | null;
};
