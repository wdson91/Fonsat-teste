# Fonsat — Assiduidade e faturação

Aplicação de demonstração com Next.js, NestJS/Prisma e PostgreSQL. Sem login real: o seletor apresenta personas de duas empresas.

## Executar

Com Docker e Compose disponíveis, na raiz:

```sh
docker compose up --build
```

Abrir [frontend](http://localhost:3000). API: [personas](http://localhost:3001/users/personas). O navegador usa localhost:3001; postgres é o DNS privado do banco, não uma URL do navegador. CORS já é permitido pela API de demonstração.

Aguardar initialize terminar e backend/frontend ficarem healthy (`docker compose ps -a`). No primeiro arranque: aplicar migrações e carregar seed **apenas se todas as tabelas de negócio estiverem vazias**. Em arranques seguintes, preservar dados. O seed desta base main inclui um exemplo PENDING_RATE; a alteração que o elimina pertence à branch ajustes, independente desta fase.

Papéis no seletor: Trabalhador regista turnos completos e guarda rascunhos; Encarregado distribui/revê trabalho; Administrativo gere tarifas e emite documentos; Cliente consulta apenas os seus documentos. Usar dados de demonstração, sem autenticação ou certificação fiscal de produção.

Parar com Ctrl+C ou `docker compose down`. Reiniciar com o mesmo comando mantém o volume. **Não usar down --volumes para parar normalmente**: elimina os dados do projeto. O projeto Compose chama-se fonsat-local, separado do antigo fonsat-teste. O novo volume app_database não reutiliza nem apaga o antigo postgres_data do Compose anterior; o banco antigo não é migrado automaticamente. PostgreSQL não publica porta no host.

Portas ocupadas? Copiar `.env.example` para `.env`, alterar WEB_PORT/API_PORT e NEXT_PUBLIC_API_URL (URL acessível pelo navegador) e reconstruir. Credenciais fixas são apenas para esta demonstração local, com frontend/API publicados em loopback. O primeiro build requer internet.

Se initialize falhar, consultar `docker compose logs initialize`. Falha de migração/seed impede iniciar a API. O marcador `_LocalInitialization` regista seed iniciado/concluído; uma interrupção deixa o estado started e o próximo arranque recusa repetir o seed destrutivo. Não marcar complete manualmente sem validar os dados. Recuperar o banco a partir de backup ou, somente num projeto descartável, recriar o volume e repetir o arranque. O comando `npm run prisma:seed` é destrutivo e não deve ser executado sobre dados a preservar.

## Testar

```sh
sh scripts/test.sh
```

Só requer shell, Docker e Compose. Cria banco/rede/volume exclusivos, sem portas do host, e limpa os próprios recursos. Resumo, logs e screenshots em `.test-results/`. O modo `baseline` é parcial e não executa browser.

## Documentação

[Decisões](DECISOES.md) · [Plano](docs/PLANO_IMPLEMENTACAO.md) · [Fluxo](docs/fluxo-das-fases.md) · [Testes](docs/plano-fase-3.md) · [Fase 5](docs/relatorio-fase-5.md)

A fase 5 pode ser integrada antes de ajustes; não contém os commits dessa branch nem o experimento abandonado de ajustes entre clientes. Revisões locais de DECISOES.md em ajustes permanecem separadas.
