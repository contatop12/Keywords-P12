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

export type Tier = "oportunidade_excelente" | "otimo" | "talvez" | "negativar";

export type Classificacao = {
  tier: Tier;
  rotulo: string;
  motivo: string;
  score_value: number;
  score_eficiencia: number;
};

export const TIER_LABELS: Record<Tier, string> = {
  oportunidade_excelente: "Oportunidade Excelente",
  otimo: "Ótimo",
  talvez: "Talvez",
  negativar: "Negativar",
};

export const TIER_ORDER: Tier[] = ["oportunidade_excelente", "otimo", "talvez", "negativar"];

// Fundo da linha (translúcido p/ tema escuro) + cor de texto/realce por tier.
export const TIER_COLORS: Record<Tier, { bg: string; fg: string }> = {
  oportunidade_excelente: { bg: "rgba(56, 132, 255, 0.16)", fg: "#5b9bff" },
  otimo: { bg: "rgba(46, 196, 122, 0.16)", fg: "#3fd089" },
  talvez: { bg: "rgba(232, 193, 60, 0.16)", fg: "#e8c13c" },
  negativar: { bg: "rgba(240, 78, 78, 0.16)", fg: "#ff6b6b" },
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

export type DiscoveryResult = {
  id: string;
  created_at: string;
  seed_keywords: string[];
  locations: string[];
  country: string;
  general: InterestItem[];
  categories: Record<string, InterestItem[]>;
  broaden_suggestions: string[];
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

export type StudyResult = DiscoveryResult & {
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

export type AgebriCategory = {
  name: string;
  keywords: string[];
};

export type AgebriResult = {
  categories: AgebriCategory[];
  restrict_suggestions: string[];
};

export type PriceItem = {
  item: string;
  a_partir_de: number;
  moeda: string;
  url?: string;
};

export type Promocao = {
  tipo: string; // ex: "desconto_percentual"
  valor: number; // ex: 20 (=20%)
  texto?: string; // ≤20 chars no Google Ads
};

// Perfil do cliente — dados que a estrutura de campanha precisa (template Vita).
export type ClientProfile = {
  id: string;
  created_at: string;
  updated_at: string;
  nome_empresa: string;
  urls_finais: string[];
  telefone: string;
  endereco: string;
  horario_funcionamento: string;
  locais: string[];
  idioma: string;
  marcas: string[];
  servicos: string[];
  precos: PriceItem[];
  promocao: Promocao | null;
  orcamento_diario: number;
  estrategia_lance: string;
  acoes_conversao: string[];
};

export type ClientProfileIndexEntry = {
  id: string;
  nome_empresa: string;
  created_at: string;
  updated_at: string;
};

// ── Estrutura de Campanha (Search MVP) ──────────────────────────────────────

export type Correspondencia = "ampla" | "frase" | "exata";

export type StructureKeyword = { texto: string; correspondencia: Correspondencia };

export type AnuncioRSA = {
  titulos: string[]; // ≤30 chars (até 15)
  descricoes: string[]; // ≤90 chars (até 4)
  caminhos: string[]; // ≤15 chars (até 2)
};

export type StructureGroup = {
  nome: string;
  url_final: string;
  keywords: StructureKeyword[];
  anuncio_rsa: AnuncioRSA;
};

export type Sitelink = { texto: string; desc1: string; desc2: string; url: string };
export type SnippetEstruturado = { tipo: string; valores: string[] };

export type StructureRecursos = {
  sitelinks: Sitelink[];
  frases_destaque: string[];
  snippets_estruturados: SnippetEstruturado[];
  imagens: string[];
  ligacao: { telefone: string; horario: string };
  lead_form: { headline: string; empresa: string };
  promocao: Promocao | null;
  precos: PriceItem[];
};

export type StructureCampanha = {
  nome: string;
  orcamento_diario: number;
  estrategia_lance: string;
  locais: string[];
  idiomas: string[];
  rede: "search";
  agendamento: string;
  conversoes: string[];
};

export type StructureStatus = "rascunho" | "ativo";
export type StructureVeiculacao = "pausada" | "ativa";

export type Structure = {
  id: string;
  created_at: string;
  updated_at: string;
  client_profile_id: string | null;
  client_name: string;
  objetivo: "search";
  status: StructureStatus;
  veiculacao: StructureVeiculacao;
  google_ads: { customer_id: string | null; campaign_resource_name: string | null };
  campanha: StructureCampanha;
  grupos: StructureGroup[];
  negativas_campanha: string[];
  recursos: StructureRecursos;
  avisos: string[]; // validações de limite que precisaram truncar
};

export type StructureIndexEntry = {
  id: string;
  client_name: string;
  objetivo: string;
  status: StructureStatus;
  created_at: string;
  grupos_count: number;
  keywords_count: number;
};

export type BriefingData = {
  company_name: string;
  niche: string;
  description: string;
  services: string;
  target_audience: string;
  main_objective: string;
  competitors: string;
  observations: string;
  urls: string[];
  restrict_keywords: string;
};
