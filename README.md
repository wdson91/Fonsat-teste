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

Para a carga inicial de demonstração: `npm run prisma:seed`. O seed padrão inclui tarifas históricas para as combinações usadas e não deixa registos em `PENDING_RATE`. O comando apaga e recria os dados de demonstração; não o repetir num banco com dados a preservar.

## Verificar

Em `backend`: `npx prisma validate` e `npm run build`.

Testes oficiais (somente Docker + Compose no host): `sh scripts/test.sh`. Evidências e resumo em `.test-results/`; o comando prepara e limpa o ambiente isolado. [Plano da fase 3](docs/plano-fase-3.md).

## Documentação

- [Enunciado](docs/enunciado.pdf)
- [Plano de implementação](docs/PLANO_IMPLEMENTACAO.md)
- [Decisões](DECISOES.md)
- [Fluxo das fases](docs/fluxo-das-fases.md)

- [Relatório da fase 1](docs/relatorio-fase-1.md)
- [Relatório da fase 2.1](docs/relatorio-fase-2.1.md)
- [Relatório da fase 2.2](docs/relatorio-fase-2.2.md)
- [Relatório da fase 2.3](docs/relatorio-fase-2.3.md)
- [Relatório da fase 2.4](docs/relatorio-fase-2.4.md)
- [Relatório da fase 2.5](docs/relatorio-fase-2.5.md)
- [Relatório da fase 2.6](docs/relatorio-fase-2.6.md)
- [Frontend: execução e verificações](frontend/README.md)
- [Relatório da fase 4.1](docs/relatorio-fase-4.1.md)
- [Relatório da fase 4.2](docs/relatorio-fase-4.2.md)
- [Relatório da fase 4.3](docs/relatorio-fase-4.3.md)
- [Relatório da fase 4.4](docs/relatorio-fase-4.4.md)
- [Relatório da fase 4.5](docs/relatorio-fase-4.5.md)
