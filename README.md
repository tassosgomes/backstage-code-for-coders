# Backstage — Code for Coders

Portal Backstage do time, atuando como **concentrador de contratos**: OpenAPI,
AsyncAPI e ODCS (Open Data Contract Standard) vindos do
[repo de contratos](https://github.com/tassosgomes/code-for-coders) e renderizados
de forma human-friendly.

## Como funciona

```
repo de contratos (GitHub)          fixtures/ (modo local)
        │                                   │
        └───────────┬───────────────────────┘
                    ▼
     ContractsEntityProvider (scan agendado)
        • classifica por conteúdo: openapi | asyncapi | datacontract (ODCS)
        • cria entidades kind: API (spec.definition = arquivo bruto)
                    ▼
              Catálogo Backstage
                    ▼
     Renderização por tipo (página da entidade API):
        • OpenAPI   → Redoc (nativo)
        • AsyncAPI  → @asyncapi/react-component (nativo do plugin api-docs)
        • ODCS      → renderer custom "Data Contract" (visão geral, propósito,
                      modelo de dados, SLAs, partes, qualidade, …)
```

- A ingestão é **automática** (entity provider com schedule, default a cada 15 min,
  `initialDelay` de 20s). Remover um contrato do repo o remove do catálogo no
  próximo ciclo.
- Arquivos são detectados por **conteúdo** (`openapi:` / `asyncapi:` /
  `apiVersion: v3.x` + `kind: DataContract`), em qualquer pasta do repo, exceto os
  excludes padrão (`.agents/**`, `.github/**`, `**/templates/**`, etc. — ajuste em
  `contracts.include/exclude` no `app-config.yaml`).
- Owner padrão: `group:default/platform` (veja `examples/org.yaml`). Um contrato
  pode sobrescrever com `info.x-owner` (OpenAPI/AsyncAPI) ou a config
  `contracts.owner`.

## Rodando

```bash
yarn install
yarn dev
```

Por padrão o provider lê o repo público de contratos (não precisa de token; para
rate limits maiores exporte `GITHUB_TOKEN`).

### Variáveis de ambiente

| Variável                | Default                                          | Descrição                                           |
| ----------------------- | ------------------------------------------------ | --------------------------------------------------- |
| `CONTRACTS_SOURCE`      | `github`                                         | `github` ou `local` (usa `fixtures/`, sem rede)     |
| `CONTRACTS_REPO_URL`    | `https://github.com/tassosgomes/code-for-coders` | Repo a escanear                                     |
| `CONTRACTS_REPO_BRANCH` | `main`                                           | Branch                                              |
| `CONTRACTS_OWNER`       | `group:default/platform`                         | Owner padrão das entidades                          |
| `CONTRACTS_LOCAL_DIR`   | `../../fixtures`                                 | Pasta no modo local (relativa a `packages/backend`) |
| `GITHUB_TOKEN`          | —                                                | PAT opcional (rate limit/repos privados)            |

Para executar a imagem de produção no Coolify, configure também:

| Variável            | Descrição |
| ------------------- | --------- |
| `APP_BASE_URL`      | URL pública do Backstage, por exemplo `https://backstage.example.com` |
| `BACKEND_SECRET`    | Segredo usado para assinar tokens do backend |
| `POSTGRES_HOST`     | Host do PostgreSQL |
| `POSTGRES_PORT`     | Porta do PostgreSQL, normalmente `5432` |
| `POSTGRES_USER`     | Usuário do PostgreSQL |
| `POSTGRES_PASSWORD` | Senha do PostgreSQL |
| `POSTGRES_DB`       | Nome do banco do PostgreSQL |
| `ALLOW_GUEST_AUTH`  | Use `true` somente para uma instância de demonstração; mantenha `false` em produção |

No Coolify, use a imagem `ghcr.io/tassosgomes/backstage-code-for-coders`, a porta interna `7007` e o health check `/.backstage/health/v1/readiness`.

Modo local (sem depender do GitHub):

```bash
CONTRACTS_SOURCE=local yarn dev
```

## Estrutura relevante

- `packages/backend/src/modules/contracts/` — provider, classificação e módulo do catálogo
- `packages/app/src/modules/contracts/` — widget ODCS registrado via `apiDocsConfigRef`
- `fixtures/` — contratos de exemplo para o modo local
- `app-config.yaml` — bloco `contracts:` (fontes, includes/excludes, schedule)

## Próximos passos sugeridos

- Auth real (GitHub OAuth) + PostgreSQL quando sair do MVP
- Identidade visual: trocar logos em `packages/app/src/modules/nav/` quando existir
- Versionamento de contratos (v1/v2 lado a lado) e comparação entre versões
