# Binding persistente de `STUDIES_KV` no Cloudflare

## Contexto e causa raiz

O projeto possui dois arquivos de configuração do Wrangler:

- `wrangler.jsonc`, na raiz, usado pelo deploy automático do Cloudflare;
- `frontend/wrangler.jsonc`, usado pelos comandos executados dentro de `frontend/`.

O binding `STUDIES_KV` foi adicionado somente à configuração do frontend. Como o deploy automático parte da raiz, cada publicação usa uma configuração sem esse binding e substitui a configuração manual feita no painel. O namespace existente e seus dados não são o problema.

## Objetivo

Fazer com que todo deploy pela raiz publique o Worker `keywords-p12` já vinculado ao namespace KV existente, sem configuração manual no painel, e impedir que as duas configurações voltem a divergir silenciosamente.

## Solução aprovada

1. Adicionar ao `wrangler.jsonc` da raiz o binding `STUDIES_KV` com o namespace existente `0ac10be016ec4be29bee244a8d7cea2c`.
2. Manter `frontend/wrangler.jsonc` para preservar os comandos locais atuais do OpenNext.
3. Criar uma validação determinística que compare os bindings de infraestrutura compartilhados entre os dois arquivos.
4. Executar essa validação antes do build usado pelo Cloudflare.

O arquivo da raiz permanece a fonte efetiva do deploy automático. O arquivo do frontend continua oferecendo compatibilidade aos comandos executados naquele diretório, enquanto a validação evita drift.

## Fluxo

1. O Cloudflare executa o build a partir da raiz.
2. A validação lê os dois arquivos Wrangler e interrompe o build se seus bindings compartilhados divergirem.
3. O OpenNext gera o Worker.
4. O deploy lê o `wrangler.jsonc` da raiz e publica `STUDIES_KV` junto com o código.
5. As rotas `/api/studies`, `/api/clients` e `/api/structures` recebem `STUDIES_KV` em `env` sem intervenção no painel.

## Tratamento de erros

A validação deve produzir uma mensagem direta indicando o binding ausente ou divergente e retornar código diferente de zero. Ela não cria, remove nem modifica namespaces remotos. O namespace atual deve ser preservado para não perder os dados existentes.

## Testes e verificação

- Reproduzir primeiro a falha da validação com o estado atual, no qual a raiz não declara `STUDIES_KV`.
- Adicionar o binding à raiz e confirmar que a validação passa.
- Executar os testes existentes do frontend.
- Executar o build do OpenNext.
- Executar um dry-run do Wrangler usando explicitamente a configuração da raiz e confirmar que `STUDIES_KV` aparece nos bindings gerados.
- Se houver credenciais Cloudflare disponíveis, confirmar o binding remoto após o deploy; a publicação remota só ocorrerá dentro do fluxo já autorizado do projeto.

## Fora de escopo

- Migrar os dados de KV para D1.
- Criar um novo namespace KV.
- Alterar o formato das chaves ou das estruturas salvas.
- Refatorar as rotas de API que já usam `STUDIES_KV`.
