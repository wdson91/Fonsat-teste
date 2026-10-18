# Relatório da fase 2.2 - obras e alocações

## Fase 2.2 - obras e alocações

Todas as rotas abaixo exigem `x-user-id`. CLIENT não acessa operações. Listagens retornam `{data,page,pageSize,total,totalPages}`, com `page=1`, `pageSize=50` e máximo 100; campos desconhecidos e valores inválidos geram 400. IDs de corpo são números inteiros positivos, não strings.

| Rota                             | Acesso e dados                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `GET /users?role=WORKER`         | ADMIN/FOREMAN, trabalhadores da empresa. `role=FOREMAN` lista encarregados. Somente id, nome e papel.                  |
| `GET /clients`                   | ADMIN: empresa; FOREMAN: clientes das obras sob sua responsabilidade.                                                  |
| `GET /trades`                    | ADMIN/FOREMAN/WORKER: ofícios da empresa.                                                                              |
| `GET /sites`                     | ADMIN: empresa; FOREMAN: suas obras; WORKER: opções da empresa, somente id/nome/endereço.                              |
| `PATCH /sites/:id/foreman`       | ADMIN, corpo `{foremanId}`; exige FOREMAN da mesma empresa.                                                            |
| `GET /allocations`               | ADMIN: empresa; FOREMAN: suas obras; WORKER: registros próprios. Filtros opcionais `workerId`, `siteId`, `from`, `to`. |
| `POST /allocations`              | ADMIN/FOREMAN, corpo `{workerId,siteId,tradeId,startDate,endDate?}`.                                                   |
| `POST /allocations/:id/end`      | ADMIN/FOREMAN, corpo `{endDate}`; altera somente o fim.                                                                |
| `POST /allocations/:id/transfer` | ADMIN/FOREMAN, corpo `{siteId,tradeId,startDate,endDate?}`; retorna `{previous,current}`.                              |

Leituras/PATCH retornam 200; POSTs retornam 201. Falta de papel: 403; referências inexistentes, de outra empresa, de papel incorreto ou obra fora da responsabilidade: 404. Sobreposição ou tentativa de alterar uma alocação com fim já definido: 409.

Períodos são **[startDate,endDate)**: fim exclusivo, nulo significa aberto. Datas `YYYY-MM-DD` representam meia-noite em **Europe/Lisbon**, respeitando horário de verão; horários exigem ISO com segundos e `Z`/offset, por exemplo `2026-10-18T08:00:00+01:00`. A resposta serializa os instantes em UTC. Filtros retornam períodos que intersectam `[from,to)`. `endDate` deve ser posterior ao início; fim futuro é permitido. Uma vez definido o fim (inclusive planeado), o período fica fechado a alterações nesta fase.

Mudar a distribuição fecha o período antigo exatamente no início do novo e cria outra linha na mesma transação; trabalhador, obra, ofício e início antigos ficam preservados. Pode usar ofício diferente do padrão do trabalhador. FOREMAN precisa gerir tanto origem quanto destino; ADMIN pode transferir entre encarregados. Não há exclusão ou edição geral de alocações. Sem campos novos de auditoria, pois o schema não os possui.

Todas as referências são verificadas dentro do tenant, incluindo papel WORKER/FOREMAN e cliente da obra. Mutações bloqueiam a linha do trabalhador antes de verificar sobreposição, serializando inclusive duas criações simultâneas sem período anterior. Obras são bloqueadas em ordem estável para evitar mudança de responsável durante a autorização. Escritas diretas fora destes serviços não têm essa garantia de sobreposição no schema: uso exclusivo dos endpoints/serviços é necessário.

Exemplo: `POST /allocations` com `{"workerId":3,"siteId":1,"tradeId":2,"startDate":"2026-10-19","endDate":"2026-10-20"}` e header da persona responsável. IDs devem ser obtidos nas listagens. Não há frontend, lançamento de horas, gestão de tarifas ou faturação implementados nesta fase.

## Verificação e limites

Build e Prisma validate aprovados; 25 testes de integração aprovados no conjunto das fases 2.1 e 2.2. Cobertura de escopos, referências de empresa/papel, mudança de encarregado, ofício diferente, histórico, rollback forçado, concorrência, datas de Lisboa e paginação. Foram usados bancos descartáveis com fixtures próprias, removidos após os testes, sem reset/seed do banco de desenvolvimento.

Comandos: `npx prisma validate`, `npm run build` e `npm test -- --runInBand`, em `backend`. O container local `fonsat_postgres` deve estar disponível e o login de teste deve poder criar/apagar bancos. Detalhes do contexto e RLS estão no [relatório da fase 2.1](relatorio-fase-2.1.md).
