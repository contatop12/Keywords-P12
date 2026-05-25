import json
import logging
import re

from backend.services import ai_service

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "Você é consultor sênior de Google Ads especializado em geração de leads para serviços locais e premium. "
    "Pense como gestor de tráfego experiente, orientado a performance, CAC, qualificação de lead e intenção de "
    "agendamento/compra. Sua tarefa: dado o briefing do cliente, gerar o MÁXIMO de clusters de palavras-chave "
    "relevantes para campanhas Google Ads Search. Seja agressivo na granularidade — prefira mais clusters específicos "
    "a poucos clusters genéricos.\n\n"
    "ORDEM OBRIGATÓRIA DE CRIAÇÃO DOS CLUSTERS:\n\n"
    "BLOCO 1 — GERAL\n"
    "- 1 cluster 'Geral': todos os termos centrais do nicho (head terms + sinônimos + long tails sem geo).\n\n"
    "BLOCO 2 — POR SERVIÇO (obrigatório para cada serviço/tema declarado)\n"
    "- 1 cluster por serviço, com seeds focadas exclusivamente naquele serviço.\n"
    "- Se nenhum serviço for declarado, infira os principais serviços do nicho e crie 1 cluster por serviço inferido.\n"
    "- Mínimo 3 clusters neste bloco.\n\n"
    "BLOCO 3 — SERVIÇO + LOCALIZAÇÃO (obrigatório se cliente tiver localização)\n"
    "- Para cada serviço do Bloco 2, crie 1 cluster equivalente com variações geográficas:\n"
    "  nome da cidade, bairros próximos, região, estado, 'perto de mim', 'próximo a mim'.\n"
    "- Nome do cluster: '[Serviço] + Localização' ou '[Serviço] [Cidade]'.\n\n"
    "BLOCO 4 — GEOLOCALIZAÇÃO GERAL\n"
    "- 1 cluster 'Geolocalização': termos genéricos do nicho combinados com cidade/região/bairros/perto de mim.\n\n"
    "BLOCO 5 — CONCORRENTES (somente se citados no briefing)\n"
    "- 1 cluster 'Concorrentes' com todos os nomes juntos (visão geral de mercado).\n"
    "- 1 cluster individual por concorrente (nome próprio + variações + 'vs', 'alternativa', 'preço', 'avaliação').\n\n"
    "BLOCO 6 — INSTITUCIONAL\n"
    "- 1 cluster 'Institucional': nome próprio do cliente + variações de escrita + endereço + telefone + 'site'.\n\n"
    "REGRAS GERAIS:\n"
    "- Cada cluster tem seeds (palavras de partida expandidas pelo Planejador Google).\n"
    "- Inclua head terms + long tails + sinônimos. Elimine termos puramente informacionais.\n"
    "- Nomes de cluster em português, descritivos, SEM os caracteres /\\?*[]: (proibidos no Excel).\n"
    "- Se houver seeds com restrição de política (medicamento de prescrição: ozempic, mounjaro, semaglutida), "
    "mova para cluster separado com observacao explícita sobre restrição.\n"
    "- NÃO limite o número de clusters. Gere todos os clusters necessários para cobrir o briefing completamente.\n\n"
    "Responda APENAS com JSON neste formato exato:\n"
    "{\n"
    '  "estrategia": "Resumo curto (2-4 frases) da abordagem geral.",\n'
    '  "clusters": [\n'
    "    {\n"
    '      "nome": "Nome da aba",\n'
    '      "intencao": "alta" | "media" | "baixa",\n'
    '      "prioridade": 1,\n'
    '      "seeds": ["seed 1", "seed 2", "seed 3", ...],\n'
    '      "observacao": "Recomendação curta (max 1 frase) sobre essa aba."\n'
    "    }\n"
    "  ]\n"
    "}"
)

_INVALID_SHEET_CHARS = re.compile(r"[\\/*?:\[\]]")


def _build_user_message(brief: dict) -> str:
    cliente = (brief.get("cliente") or "").strip() or "Cliente sem nome"
    especialidade = (brief.get("especialidade") or "").strip() or "Não informado"
    raw_urls = [u.strip() for u in (brief.get("urls") or []) if u and u.strip()]
    urls_str = "\n".join(f"- {u}" for u in raw_urls) if raw_urls else "-"
    localizacao = (brief.get("localizacao") or "").strip() or "Brasil"
    objetivo = (brief.get("objetivo") or "Geração de leads para consulta").strip()
    servicos = [s.strip() for s in (brief.get("servicos") or []) if s and s.strip()]
    concorrentes = [c.strip() for c in (brief.get("concorrentes") or []) if c and c.strip()]
    observacoes = (brief.get("observacoes") or "").strip()
    negativar = (brief.get("negativar") or "").strip()

    parts = [
        f"CLIENTE: {cliente}",
        f"ESPECIALIDADE / NICHO: {especialidade}",
        f"SITES DO CLIENTE:\n{urls_str}",
        f"LOCALIZAÇÃO: {localizacao}",
        f"OBJETIVO: {objetivo}",
    ]
    if servicos:
        parts.append("SERVIÇOS / TEMAS A COBRIR:\n- " + "\n- ".join(servicos))
    else:
        parts.append("SERVIÇOS / TEMAS: (nenhum declarado — sugira clusters padrão do nicho)")
    if concorrentes:
        parts.append("CONCORRENTES (criar aba por nome):\n- " + "\n- ".join(concorrentes))
    if observacoes:
        parts.append(f"OBSERVAÇÕES LIVRES:\n{observacoes}")
    if negativar:
        parts.append(f"TERMOS PARA NEGATIVAR (NÃO incluir nas seeds, evitar esses contextos):\n{negativar}")
    return "\n\n".join(parts)


def _sanitize_cluster(raw: dict) -> dict | None:
    if not isinstance(raw, dict):
        return None
    nome = raw.get("nome")
    seeds = raw.get("seeds")
    if not isinstance(nome, str) or not isinstance(seeds, list):
        return None
    nome_clean = _INVALID_SHEET_CHARS.sub(" ", nome).strip()
    if not nome_clean:
        return None
    seeds_clean: list[str] = []
    seen: set[str] = set()
    for seed in seeds:
        if not isinstance(seed, str):
            continue
        s = seed.strip()
        if not s or len(s) > 80:
            continue
        key = s.lower()
        if key in seen:
            continue
        seen.add(key)
        seeds_clean.append(s)
    if not seeds_clean:
        return None

    intencao = raw.get("intencao")
    if intencao not in {"alta", "media", "baixa"}:
        intencao = "media"

    prioridade_raw = raw.get("prioridade")
    try:
        prioridade = int(prioridade_raw)
    except (TypeError, ValueError):
        prioridade = 3
    prioridade = max(1, min(5, prioridade))

    observacao = raw.get("observacao")
    if not isinstance(observacao, str):
        observacao = ""
    observacao = observacao.strip()[:240]

    return {
        "nome": nome_clean,
        "intencao": intencao,
        "prioridade": prioridade,
        "seeds": seeds_clean,
        "observacao": observacao,
    }


def plan_keywords(brief: dict) -> dict:
    user_message = _build_user_message(brief)
    messages = [
        {"role": "system", "content": _SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]
    raw = ai_service._chat(messages, temperature=0.4)

    try:
        parsed = json.loads(raw)
    except Exception:
        logger.exception("Falha ao parsear plano de keywords: %s", raw[:500])
        return {"estrategia": "", "clusters": []}

    estrategia = parsed.get("estrategia")
    if not isinstance(estrategia, str):
        estrategia = ""

    clusters_raw = parsed.get("clusters")
    if not isinstance(clusters_raw, list):
        return {"estrategia": estrategia.strip(), "clusters": []}

    clusters: list[dict] = []
    used_names: set[str] = set()
    for entry in clusters_raw:
        cluster = _sanitize_cluster(entry)
        if cluster is None:
            continue
        base = cluster["nome"]
        candidate = base
        counter = 2
        while candidate in used_names:
            candidate = f"{base} ({counter})"
            counter += 1
        cluster["nome"] = candidate
        used_names.add(candidate)
        clusters.append(cluster)

    clusters.sort(key=lambda c: (c["prioridade"], 0 if c["intencao"] == "alta" else 1 if c["intencao"] == "media" else 2))

    return {
        "estrategia": estrategia.strip(),
        "clusters": clusters,
    }
