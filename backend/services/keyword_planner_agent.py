import json
import logging
import re

from backend.services import ai_service

logger = logging.getLogger(__name__)

_SYSTEM_PROMPT = (
    "Você é consultor sênior de Google Ads especializado em geração de leads para serviços médicos premium e locais. "
    "Pense como gestor de tráfego experiente, orientado a performance, CAC, qualificação de lead e intenção de "
    "agendamento. Sua tarefa: dado o briefing do cliente, gerar clusters de palavras-chave prontas para campanhas "
    "Google Ads Search. Foque em termos com intenção comercial real (priorize quem está mais perto de agendar "
    "consulta/comprar).\n\n"
    "REGRAS CRÍTICAS:\n"
    "1. Cada cluster vira uma ABA do estudo Google Ads.\n"
    "2. Cada cluster tem entre 5 e 15 seeds (palavras de partida que serão expandidas pelo Planejador Google).\n"
    "3. Inclua head terms + long tails + sinônimos + variações geográficas + 'perto de mim' quando fizer sentido.\n"
    "4. Elimine termos puramente informacionais (ex: 'o que é diabetes', 'como funciona ozempic').\n"
    "5. Sempre crie um cluster 'Geral' agregando os termos centrais do nicho do cliente.\n"
    "6. Se o cliente atua local, crie cluster 'Geolocalização' com variações de bairro/cidade/região + 'perto de mim'.\n"
    "7. Se houver concorrentes citados, crie 1 cluster 'Concorrentes' (resumo) + 1 cluster por concorrente "
    "(nome próprio + variações).\n"
    "8. Crie cluster 'Institucional' com variações do nome próprio do cliente.\n"
    "9. Para cada serviço/tema declarado, crie um cluster específico.\n"
    "10. Nomes de cluster em português, curtos (max 31 chars), SEM os caracteres /\\?*[]: (proibidos no Excel).\n"
    "11. Sinalize seeds com possível restrição de política (ex: nome de medicamento de prescrição: ozempic, "
    "mounjaro, semaglutida) movendo essas seeds para clusters separados, marcados com observacao explícita.\n\n"
    "Responda APENAS com JSON neste formato exato:\n"
    "{\n"
    '  "estrategia": "Resumo curto (2-4 frases) da abordagem geral.",\n'
    '  "clusters": [\n'
    "    {\n"
    '      "nome": "Nome da aba (max 31 chars)",\n'
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
    nome_clean = _INVALID_SHEET_CHARS.sub(" ", nome).strip()[:31]
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
        if len(seeds_clean) >= 15:
            break
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
            suffix = f" ({counter})"
            candidate = (base[: 31 - len(suffix)] + suffix)
            counter += 1
        cluster["nome"] = candidate
        used_names.add(candidate)
        clusters.append(cluster)

    clusters.sort(key=lambda c: (c["prioridade"], 0 if c["intencao"] == "alta" else 1 if c["intencao"] == "media" else 2))

    return {
        "estrategia": estrategia.strip(),
        "clusters": clusters,
    }
