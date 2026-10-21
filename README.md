# Fonsat — Assiduidade e faturação

Aplicação de demonstração para distribuir trabalhadores por obras, registar horas e faturar clientes, com isolamento entre empresas e histórico das correções.

**Stack:** Next.js, TypeScript, Tailwind CSS, NestJS, Prisma e PostgreSQL.

## Executar

Requisitos: Docker e Docker Compose.

Na raiz do projeto:

```sh
docker compose up --build
```

- Frontend: http://localhost:3000
- API: http://localhost:3001/users/personas

Aguardar a inicialização terminar e os serviços ficarem saudáveis:

```sh
docker compose ps -a
```

O primeiro arranque aplica as migrações e carrega os dados de demonstração apenas se o banco estiver vazio. O seed inclui duas empresas, utilizadores, obras, alocações, tarifas históricas, trabalhos e documentos de exemplo, sem preços pendentes.

Os dados são preservados entre arranques. Para parar:

```sh
docker compose down
```

**Atenção:** `docker compose down --volumes` elimina os dados do projeto.

O primeiro build requer internet. Não é necessário instalar Node.js ou PostgreSQL no computador.

### Portas e inicialização

Para alterar as portas, copiar `.env.example` para `.env`, ajustar `WEB_PORT`, `API_PORT` e `NEXT_PUBLIC_API_URL` e reconstruir os serviços.

Se a inicialização falhar:

```sh
docker compose logs initialize
```

Uma execução interrompida do seed não é repetida automaticamente, para evitar apagar dados. Consulte o [relatório da fase 5](docs/relatorio-fase-5.md) para detalhes.

## Usar a aplicação

Não existe login real. O seletor de personas permite experimentar os quatro papéis:

| Papel | Funcionalidades |
|---|---|
| Trabalhador | Preencher turnos, guardar rascunhos no dispositivo e enviar turnos completos |
| Encarregado | Distribuir trabalhadores, analisar divergências e corrigir horas |
| Administrativo | Gerir obras e tarifas, conferir prévias e emitir faturas e notas |
| Cliente | Consultar os seus documentos emitidos e a composição dos valores |

Os rascunhos funcionam sem rede depois de a interface estar carregada. O envio é iniciado pelo utilizador quando existe ligação.

As faturas emitidas são preservadas. Correções posteriores geram notas de crédito ou débito pela diferença, relacionadas com o documento original.

## Testes

Executar a bateria automatizada:

```sh
sh scripts/test.sh
```

O comando prepara um ambiente Docker isolado, executa as verificações e remove os próprios recursos. Não utiliza nem apaga o banco de demonstração.

Os resultados, logs e capturas ficam em `.test-results/`.

Para repetir os passos 1 a 11 do roteiro pela interface, com seed completo num banco descartável e captura de prints:

```sh
sh scripts/test-manual-ui.sh
```

Consulte o [relatório dos testes pela interface](docs/relatorio-testes-manuais-frontend.md).

## Documentação

- [Enunciado](docs/enunciado.pdf)
- [Decisões e justificações](DECISOES.md)
- [Plano de implementação](docs/PLANO_IMPLEMENTACAO.md)
- [Fluxo das fases](docs/fluxo-das-fases.md)
- [Plano de testes](docs/plano-fase-3.md)

## Relatórios das fases

A implementação seguiu a ordem **1 → 2 → 4 → 3 → 5**.

| Fase | Entrega |
|---|---|
| [1 — Base do banco](docs/relatorio-fase-1.md) | Modelo, migrações e proteções do banco |
| [2.1 — Contexto e autorização](docs/relatorio-fase-2.1.md) | Personas, permissões e contexto da empresa |
| [2.2 — Obras e alocações](docs/relatorio-fase-2.2.md) | Distribuição e gestão dos períodos |
| [2.3 — Tarifas](docs/relatorio-fase-2.3.md) | Preços e vigências históricas |
| [2.4 — Registos de horas](docs/relatorio-fase-2.4.md) | Eventos, consolidação e deduplicação |
| [2.5 — Correções](docs/relatorio-fase-2.5.md) | Versões e ajustes de trabalho |
| [2.6 — Faturação](docs/relatorio-fase-2.6.md) | Prévias, emissão e documentos de ajuste |
| [4.1 — Base do frontend](docs/relatorio-fase-4.1.md) | Navegação, personas e integração HTTP |
| [4.2 — Grelha do trabalhador](docs/relatorio-fase-4.2.md) | Turnos, rascunhos e envios |
| [4.3 — Gestão de obras](docs/relatorio-fase-4.3.md) | Distribuição, pendências e correções |
| [4.4 — Faturação no frontend](docs/relatorio-fase-4.4.md) | Tarifas, emissão e detalhe dos documentos |
| [4.5 — Integração](docs/relatorio-fase-4.5.md) | Revisão dos fluxos e responsividade |
| [3.1 — Base dos testes](docs/relatorio-fase-3.1.md) | Ambiente Docker e execução das verificações |
| [3.2 — Isolamento e integridade](docs/relatorio-fase-3.2.md) | Permissões, RLS, constraints e triggers |
| [3.3 — Regras financeiras](docs/relatorio-fase-3.3.md) | Tarifas, arredondamento, histórico e concorrência |
| [3.4 — Fluxos integrados](docs/relatorio-fase-3.4.md) | Verificações dos fluxos completos |
| [5 — Execução com Docker](docs/relatorio-fase-5.md) | Arranque completo e persistência dos dados |

### Ajustes e evidências

- [Relatório dos ajustes](docs/relatorio-ajustes.md)
- [Testes pela interface e prints](docs/relatorio-testes-manuais-frontend.md)

## Limites da demonstração

Não inclui autenticação real, emissão fiscal certificada, integração com a AT, IVA, SAF-T, envio de emails ou publicação em produção.

As decisões e a proposta de evolução fiscal estão descritas em [DECISOES.md](DECISOES.md).
