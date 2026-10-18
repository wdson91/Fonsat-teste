# Relatório da fase 1 - base de dados e estrutura inicial

## Implementação

Backend inicial NestJS 10 com Prisma 6 e PostgreSQL 16; Docker Compose para o banco local. Schema com empresas, utilizadores, clientes, ofícios, obras, alocações, tarifas, registros de trabalho e faturação. Migration com RLS e triggers de imutabilidade e seed de demonstração.

Nesta fase ainda não há endpoints de negócio, resolução de persona ou autorização HTTP. Frontend Next.js está previsto, não implementado.

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

Validação da base, dentro de `backend`: `npx prisma validate` e `npm run build`. Não há testes de identidade/autorização nesta fase.

## Verificações registradas

Schema Prisma válido, build aprovado e migration inicial aplicada no PostgreSQL local. As suítes de identidade, autorização e operações pertencem às fases seguintes; não há suíte de integração própria da fase 1.
