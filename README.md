# Meta Interests Finder (MVP)

Implementacao fullstack da ideia do `PRD-Projeto.md`, seguindo a arquitetura operacional de 3 camadas do `AGENTS.md`.

## Estrutura

- `directives/`: SOPs do fluxo (camada de diretivas)
- `execution/`: scripts determinísticos utilitários (camada de execução)
- `backend/`: API FastAPI com integração Meta Graph API
- `frontend/`: app Next.js para busca e visualização
- `.tmp/`: artefatos temporários

## Backend (FastAPI)

### Setup

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r backend/requirements.txt
```

Crie `.env` na raiz usando `.env.example`.

Para resultados mais consistentes com o Direcionamento Detalhado do Ads Manager, configure `META_AD_ACCOUNT_ID` (ID da conta de anúncios) no `.env`.

### Rodar API

```bash
uvicorn backend.main:app --reload
```

Endpoint principal:

- `POST /api/meta/search`

Payload:

```json
{
  "keyword": "emagrecimento",
  "country": "BR",
  "limit": 50
}
```

## Frontend (Next.js)

### Setup do frontend

```bash
cd frontend
npm install
```

Crie `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8011
```

### Rodar app

```bash
npm run dev
```

Opcional (rodando da raiz):

```bash
npm run frontend:install
npm run frontend:dev
```

Atalho da raiz (equivalente):

```bash
npm run dev
```

`npm run dev` sobe backend + frontend juntos, limpando automaticamente as portas `3000`, `3001`, `8000` e `8011` antes de iniciar.

## Funcionalidades MVP implementadas

- Busca por keyword na Meta Ads API via backend
- Busca por keyword no Google Ads (Keyword Ideas API) via backend
- Agente de relevância para manter apenas direcionamentos semelhantes à keyword
- Filtros de país e limite
- Tabela com `name`, `audience_size`, `type`, `path`
- Enriquecimento de `audience_size` via `delivery_estimate` (quando possível)
- Cópia de nome e ID
- Salvar interesse em `localStorage`
- Estados: loading, vazio, erro
- Buscas ilimitadas para uso interno da empresa

## Aba Google Ads

- Endpoint backend: `POST /api/google/search`
- Usa credenciais OAuth + Google Ads API do `.env`
- Suporta até 10 palavras-chave por busca (formato chips, igual "Descobrir novas palavras-chave")
- Colunas alinhadas ao estudo da planilha:
  - `Palavra-Chave`
  - `Média de Pesquisas`
  - `Mudança em três meses`
  - `Mudança em relação ao mesmo mês do ano anterior`
  - `Concorrência`
  - `Grau de concorrência`
  - `Menores valores para aparecer no topo da pesquisa`
  - `Maiores valores para aparecer no topo da pesquisa`
  - `Searches: <Mês/Ano>` (últimos 12 meses retornados)

### Ajuste fino de relevância

No `.env` você pode calibrar a rigidez do filtro:

- `RELEVANCE_FILTER_ENABLED=true|false`
- `RELEVANCE_THRESHOLD=0.32` (quanto maior, mais restrito; se nada passar, retorna `0` resultados)

## Google Ads - obter refresh token e customer ID

Antes de gerar o token, adicione no OAuth Client do Google Cloud a URI de redirecionamento:

- `http://localhost:8080/callback`

Com isso configurado, use:

```bash
python execution/google_ads_oauth_helper.py auth-url
```

Abra a URL retornada, faça login e copie o `code` da URL de retorno. Depois:

```bash
python execution/google_ads_oauth_helper.py exchange-code --code "COLE_O_CODE_AQUI"
```

Pegue o valor retornado e preencha no `.env`:

- `GOOGLE_ADS_REFRESH_TOKEN=...`

Para descobrir os customer IDs acessíveis:

```bash
python execution/google_ads_oauth_helper.py list-customers --refresh-token "SEU_REFRESH_TOKEN"
```

Se necessário, configure no `.env`:

- `GOOGLE_ADS_API_VERSION=v20`

Use um dos IDs retornados em:

- `GOOGLE_ADS_CUSTOMER_ID=...`

## Script determinístico (execução)

Para rodar busca sem frontend:

```bash
python execution/meta_interest_cli.py --keyword "emagrecimento" --country BR --limit 20
```

## Checklist de validação local

1. Versões:
   - `node -v`
   - `npm -v`
   - `python --version`
2. Backend:
   - `python -m venv .venv`
   - `.venv\Scripts\python -m pip install -r backend/requirements.txt`
   - `.venv\Scripts\python -m uvicorn backend.main:app --reload`
   - abrir `http://127.0.0.1:8011/health` e validar `{"status":"ok"}`
3. Frontend:
   - `cd frontend`
   - `npm install`
   - `npm run build`
   - `npm run dev`
4. Integração:
   - preencher `ACCESS_TOKEN` no `.env`
   - buscar keyword na interface e validar tabela + ações
