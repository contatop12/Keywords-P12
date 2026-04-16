# SOP: Pesquisa de Interesses Meta Ads

## Objetivo
Buscar interesses da Meta Ads API a partir de uma keyword e retornar dados normalizados para uso em segmentacao de campanhas.

## Entradas
- `keyword` (obrigatorio)
- `country` (default: `BR`)
- `limit` (default: `50`, maximo `100`)

## Ferramentas e scripts
- API backend FastAPI: `backend/main.py` (`POST /api/meta/search`)
- Script deterministico CLI: `execution/meta_interest_cli.py`

## Fluxo padrao
1. Validar entradas (keyword nao vazia e limite entre 1 e 100).
2. Ler `ACCESS_TOKEN` do `.env`.
3. Chamar Meta Graph API endpoint `/search` com `type=adinterest`.
4. Normalizar campos:
   - `id`, `name`, `audience_size`, `type`, `path`
5. Retornar lista vazia quando nao houver resultados.
6. Em falha externa, retornar erro amigavel com contexto de causa.

## Saidas esperadas
- JSON com formato:
  - `results: Interest[]`
- Logs com keyword, limite e quantidade retornada.

## Edge cases e tratamento
- Token ausente: interromper com erro orientativo.
- Timeout/rede: erro amigavel sem vazar stacktrace.
- `audience_size` ausente: manter `null`.
- Rate limit Meta: tratar como erro externo.

## Self-anneal
Quando houver falha:
1. registrar stacktrace e causa;
2. corrigir script/servico;
3. testar novamente com keyword real;
4. atualizar este SOP com o aprendizado.
