# Fonsat - Assiduidade e faturação

Exercício técnico para gerir alocações de trabalhadores, registar horas e faturar clientes, com isolamento entre empresas e histórico financeiro rastreável.

Stack: NestJS 10, Prisma 6 e PostgreSQL 16. Frontend previsto em Next.js.

## Executar

Com Docker e Node.js disponíveis, na raiz:

```sh
docker compose up -d
cd backend
cp .env.example .env
npm ci
npx prisma generate
npx prisma migrate deploy
npm run start:dev
```

Para a carga inicial de demonstração: `npm run prisma:seed`. Não repetir o seed num banco com dados a preservar.

## Verificar

Em `backend`: `npx prisma validate` e `npm run build`.

Testes: `npm test -- --runInBand`. Exigem o PostgreSQL local e permissão para criar/apagar bancos de teste descartáveis.

## Documentação

- [Enunciado](docs/enunciado.pdf)
- [Plano de implementação](docs/PLANO_IMPLEMENTACAO.md)
- [Decisões](DECISOES.md)
- [Fluxo das fases](docs/fluxo-das-fases.md)

- [Relatório da fase 1](docs/relatorio-fase-1.md)
- [Relatório da fase 2.1](docs/relatorio-fase-2.1.md)
- [Relatório da fase 2.2](docs/relatorio-fase-2.2.md)
