# 📄 PRD — Ferramenta de Pesquisa de Interesses (Meta Ads)

## 🎯 Objetivo
Desenvolver uma ferramenta web que permita buscar interesses diretamente da **Meta Ads API (Facebook/Instagram)** a partir de uma keyword, retornando dados relevantes para segmentação de campanhas.

---

## 👤 Usuário-alvo
- Gestores de tráfego
- Afiliados
- Donos de e-commerce
- Agências de marketing

---

## 💡 Proposta de valor
Facilitar a descoberta de interesses para campanhas no Meta Ads, permitindo:
- Encontrar interesses relacionados rapidamente
- Validar tamanho de audiência
- Melhorar segmentações

---

## ⚙️ Escopo do MVP

### ✅ Funcionalidades incluídas

#### 1. Busca de interesses
- Input de keyword
- Botão "Search"
- Busca via API oficial do Meta Ads

---

#### 2. Filtros
- País (obrigatório - default: BR)
- Limite de resultados (default: 50)

---

#### 3. Tabela de resultados

Campos exibidos:

- Nome do interesse (`name`)
- Tamanho da audiência (`audience_size`)
- Tipo (`type`)
- Categoria (`path`)
- ID (não visível, mas copiável)

---

#### 4. Ações do usuário
- Copiar nome do interesse
- Copiar ID do interesse
- Salvar interesse (localStorage no MVP)

---

#### 5. Estados da aplicação
- Loading (spinner/skeleton)
- Empty state (sem resultados)
- Error state (erro de API)

---

#### 6. Limite de uso (simples)
- X buscas por dia (frontend controlado)
- Exibir contador de buscas restantes

---

## ❌ Fora do escopo (por enquanto)
- Google Ads
- TikTok Ads
- Sistema de login
- Banco de dados persistente
- Sugestões inteligentes
- Exportação

---

## 🧱 Arquitetura

```
Frontend (Next.js)
        ↓
Backend (FastAPI - Python)
        ↓
Meta Graph API
```

---

## 🔌 Backend — Especificação técnica

### Stack
- Python 3.11+
- FastAPI
- Requests
- Uvicorn

---

### Endpoint principal

```http
POST /api/meta/search
```

---

### Request

```json
{
  "keyword": "emagrecimento",
  "country": "BR",
  "limit": 50
}
```

---

### Response

```json
{
  "results": [
    {
      "id": "6003139266461",
      "name": "Fitness e bem-estar",
      "audience_size": 120000000,
      "type": "interest",
      "path": ["Health", "Fitness"]
    }
  ]
}
```

---

## 🔗 Integração com Meta Ads API

### Endpoint utilizado

```http
GET https://graph.facebook.com/v19.0/search
```

---

### Parâmetros

```text
type=adinterest
q={keyword}
limit={limit}
locale=pt_BR
access_token={ACCESS_TOKEN}
```

---

## 🔐 Autenticação (Meta)

### Necessário:
- Conta Meta Business
- App criado em Meta Developers
- Permissões:
  - `ads_read`
  - `ads_management`
- Access Token válido (via Graph API Explorer ou System User)

---

## 🧠 Lógica da aplicação

1. Usuário insere keyword
2. Front envia request para `/api/meta/search`
3. Backend:
   - Chama Meta API
   - Normaliza resposta
4. Front renderiza tabela

---

## 🧑‍💻 Estrutura do projeto (backend)

```
backend/
│
├── main.py
├── routes/
│   └── meta.py
├── services/
│   └── meta_service.py
├── core/
│   └── config.py
```

---

## ⚡ Regras de negócio

- Keyword não pode ser vazia
- Limite máximo de resultados: 100
- Se API falhar → retornar erro amigável
- Se não houver resultados → retornar lista vazia

---

## ⚠️ Riscos e limitações

- API do Meta pode restringir acesso
- Rate limit pode impactar uso
- Nem todos interesses possuem `audience_size`
- Token pode expirar

---

## ✅ Critérios de aceite

- Usuário consegue buscar uma keyword
- Resultados retornam da API do Meta
- Dados aparecem corretamente na tabela
- Loading e erros são tratados
- Interface responsiva

---

## 🚀 Roadmap

### MVP
- Busca funcional via Meta API
- UI básica
- Tabela de resultados

### V1
- Sistema de favoritos persistente
- Cache de resultados
- Melhor tratamento de erros

### V2
- Sugestões automáticas
- Clusterização de interesses
- Exportação CSV

---

## 🧪 Métricas de sucesso

- Nº de buscas realizadas
- Tempo médio por sessão
- Nº de interesses copiados/salvos

---

## 🤖 Prompt final para o Cursor

```
Build a fullstack app for a Meta Ads interest search tool.

Backend (FastAPI):
- Endpoint POST /api/meta/search
- Input: keyword, country, limit
- Call Meta Graph API:
  GET https://graph.facebook.com/v19.0/search
  type=adinterest
- Return:
  id, name, audience_size, type, path

Requirements:
- Use requests
- Use environment variable for ACCESS_TOKEN
- Clean architecture (routes + services)
- Add error handling
- Add logging
- Enable CORS

Frontend (Next.js):
- Search input + button
- Results table
- Show:
  name, audience_size, type, path
- Copy buttons
- Loading state
- Error state

Keep everything clean, minimal, and production-ready
```