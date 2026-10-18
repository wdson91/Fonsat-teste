# Fonsat - Assiduidade e faturação

Exercício técnico para gerir alocações de trabalhadores, registar horas e faturar clientes, com isolamento entre empresas e histórico financeiro rastreável.

Stack: NestJS 10, Prisma 6 e PostgreSQL 16. Frontend previsto em Next.js.

## Documentação

- `docs/enunciado.pdf`: requisitos.
- `docs/PLANO_IMPLEMENTACAO.md`: plano de implementação.
- `DECISOES.md`: decisões de modelagem, incluindo comportamentos previstos para fases seguintes.

## Branches e fases

- `main`: base documental com este README e os documentos. Receberá a implementação por PRs, na ordem das fases.
- `fase-1/base-banco`: backend inicial, schema Prisma, migration com RLS e triggers, seed e configuração local do PostgreSQL.
- `fase-2.1/contexto-autorizacao`: deriva da fase 1; contexto de persona e autorização ainda estão pendentes.

As fases seguintes partem da anterior. O PR da fase 2.1 para `main` deve aguardar a integração da fase 1 para não misturar diffs. Nenhum PR ou publicação foi feito nesta organização inicial.

## Executar a fase 1

Na branch `fase-1/base-banco`, com Docker e Node.js disponíveis:

```sh
docker compose up -d
cd backend
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
npm run start:dev
```

O seed é uma carga inicial de demonstração: não repetir num banco com dados a preservar. A fase 1 ainda não oferece endpoints de negócio. A conexão de desenvolvimento é privilegiada; operações de negócio devem usar `withTenant` e somente o cliente `tx` da transação para aplicar RLS.

Validação da base, dentro de `backend`: `npx prisma validate` e `npm run build`. Os testes de identidade e autorização serão adicionados na fase 2.1.
