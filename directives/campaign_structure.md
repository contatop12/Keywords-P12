# SOP: Criador de Estrutura de Campanha Search (Agente Criador)

## Objetivo
A partir do estudo classificado (palavras aprovadas) + perfil do cliente, montar uma estrutura
completa de campanha de Search no modelo do template de referência (Vita Áudio): campanha +
grupos (1 aba = 1 grupo de anúncios) + RSA por grupo + keywords + negativas globais + recursos
compartilhados. A IA escreve a copy; o código determinístico valida/garante os limites de
caractere e a estrutura.

## Arquitetura (3 camadas / DOE)
- **Diretiva:** este arquivo.
- **IA (só copy/julgamento):** `frontend/lib/server/openRouter.ts` (`chatJson`) — gera títulos,
  descrições, caminhos (RSA) e recursos (sitelinks, frases de destaque, snippets).
- **Execução determinística:** `frontend/lib/server/campaignBuilder.ts` — agrupa keywords,
  monta o objeto `Structure`, **trunca/valida limites** e preenche recursos a partir do perfil.
- **Rota:** `frontend/app/api/google/build-campaign/route.ts` (`POST /api/google/build-campaign`).

## Entradas
- `tabs`: abas do estudo já avaliado — itens com `classificacao.tier`. (1 aba = 1 grupo)
- `clientProfile` (ou `clientProfileId`): dados do anunciante.
- `objetivo`: `search` (MVP).

## Regras de montagem
1. **Grupos:** uma aba vira um grupo. Keywords do grupo = itens com `tier ≠ negativar`.
   Correspondência default: `frase`. Aba sem keywords aprovadas é ignorada.
2. **Negativas da campanha:** todos os itens `negativar` (de todas as abas), únicos.
3. **RSA por grupo (IA):** até 15 títulos (≤30), até 4 descrições (≤90), até 2 caminhos (≤15).
   Usa nome do grupo + amostra de keywords + perfil (serviços, marcas, promoção). Existe um
   bloco-base de copy reaproveitado entre grupos, com variações por tema do grupo.
4. **URL final do grupo:** primeira `urls_finais` do perfil.
5. **Campanha:** nome `"{empresa} — Search"`, orçamento/estratégia/locais/idioma/conversões do
   perfil; `rede=search`; `agendamento="todos os dias"`.
6. **Recursos (compartilhados):**
   - sitelinks (IA): texto ≤25, desc1/desc2 ≤35, url.
   - frases_destaque (IA): ≤25.
   - snippets_estruturados (IA): 3 tipos (ex. Serviços, Marcas, Tipos), valores ≤25.
   - ligacao: telefone + horário do perfil.
   - promocao: do perfil (texto ≤20).
   - precos: do perfil.
   - lead_form: headline (≤30), empresa (≤25 — nome da empresa do perfil).

## Limites de caractere (garantir por truncamento; registrar em `avisos`)
títulos ≤30 · descrições ≤90 · caminhos ≤15 · sitelink texto ≤25, desc ≤35 · frases ≤25 ·
snippets ≤25 · nome empresa ≤25 · promoção texto ≤20 · lead_form headline ≤30.

## Saída
Objeto `Structure` (ver `lib/types.ts`) com `status="rascunho"`, `veiculacao="pausada"`,
`google_ads` vazio, e `avisos[]` com qualquer texto que precisou ser truncado.

## Edge cases
- Sem `OPENROUTER_API_KEY` ou IA falha: usar fallback determinístico de copy (nome do grupo +
  keywords + perfil) e registrar aviso. Nunca quebrar a montagem.
- IA retorna texto acima do limite: truncar e registrar aviso.
- Perfil incompleto (sem telefone/promoção): recursos correspondentes ficam vazios.
- Aba só com `negativar`: não vira grupo; suas negativas entram nas negativas da campanha.

## Self-anneal
Em falha: registrar causa, corrigir `campaignBuilder.ts`/prompt, testar com estudo real,
atualizar esta diretiva.
