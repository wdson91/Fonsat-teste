# Fase 3.4 — fluxos integrados e fechamento

Branch `fase-3.4/fluxos-integrados`, sobre a 3.3. Os drivers Playwright existentes foram executados contra frontend de produção e API real, com fixtures e banco descartável próprios para cada grupo. Não foram alterados services, controllers, DTOs, UI de produção, schema ou migrations.

## Ambiente e verificações

Comando oficial, a partir da raiz deste worktree: `sh scripts/test.sh`. Host requer shell, Docker e Compose; Node, PostgreSQL, psql, Chromium e dependências ficam nos containers. Não há portas publicadas nem acesso ao docker.sock pelo runner. O modo `baseline` é parcial; o fechamento usa o comando completo sem argumentos.

Browser em `http://localhost:3100` dentro do container checks, com API em `http://checks:3101` e PostgreSQL em `postgres:5432`. Este localhost pertence ao container e permite o contexto seguro nativo exigido por crypto.randomUUID. Não há polyfill nem desativação de segurança. Os ensaios anteriores com frontend via hostname HTTP de Compose expuseram falha de infraestrutura, classificada como tal, sem alterar a aplicação. SDK Playwright 1.62.1, Chromium 151.0.7922.34.

Os ajustes de QA esperam a semana renderizada e a preparação das fixtures. O cenário de resposta atrasada sincroniza a resposta real por barreiras, sem sleep arbitrário. A comparação da distribuição usa o dia civil de Lisboa. Os artefactos de falha incluem erros JavaScript; o runner distingue falha de verificação, infraestrutura e ausência de casos.

## Resultado final

Execução `.test-results/20261020t140753z-202923/`: **exit 0; 62/62 backend em 8 suites, 10/10 frontend, 12 cenários browser-core e 7 verificações browser-distribution aprovados**. Builds backend/frontend, tipos e Prisma validate aprovados; zero erros JavaScript capturados. Diagnósticos backend/browser: zero casos, registados como no_cases. Nenhum banco secundário restante; cleanup removeu containers, rede, volume e imagem do projeto.

O smoke cobre os quatro papéis, correções e histórico, prévia/409, cadeia financeira 80→70→crédito10→débito5=65, pendências e atrasados, atribuição de responsável, alocações, offline/replay após resposta perdida, storage corrompido, isolamento por persona/tenant e quota real do navegador. A distribuição cobre criação, cópia sem sobrescrever, preservação do formulário em 409, encerramento e fronteiras de calendário. Screenshots desktop/mobile e resultados JSON ficam nas subpastas browser-core e browser-distribution; revisão visual do fluxo mobile sem sobreposição encontrada.

## Ensaios de orquestração

- `.test-results/20261020t114851z-93610/`: diagnóstico backend sintético deliberadamente falho, `CONTROL_DIAGNOSTIC_FAILURE`. Os 62 testes backend, 10 frontend, builds e ambos os grupos browser passaram; o diagnóstico teve 1 falha, o comando retornou 1 e executou cleanup. O ficheiro temporário foi removido. Não é defeito de produção nem caso entregue.
- `.test-results/20261020t140735z-197148/`: TERM enviado somente ao processo criado para o ensaio, após início do backend. Retorno 143; cleanup.log confirma remoção dos containers, volume, rede e imagem exclusivos. Nenhum processo de desenvolvimento foi sinalizado.
- Os ensaios iniciais de contexto inseguro retornaram erro de infraestrutura e continuaram os grupos independentes. A execução completa já tinha passado em `.test-results/20261020t114536z-89336/`; a última execução confirma a versão final do runner após os ensaios.

Não há diagnósticos de defeitos de produção confirmados: zero casos backend e browser no fechamento. Q-01 permanece uma questão explícita sobre garantia de coerência das duas pontas do vínculo contra SQL direto autorizado, sem caminho HTTP cruzando Company confirmado; ver [registo de questões](defeitos-fase-3.md).

## Entrega e limites

As branches encadeadas são 3.1 → 3.2 → 3.3 → 3.4, cada uma com commit e relatório. A fase 5 de infraestrutura de produção continua pendente. Sem push, PR ou merge. O experimental abandonado de ajustes entre clientes não foi incorporado. O checkout original, as suas alterações locais e o banco de demonstração ficam preservados.

Comparação final com a base `42acffb`: nenhuma diferença em código backend fora de specs, frontend/src, schema/migrations, docker-compose.yml de produção ou docs/fase2-plan.md. Checkout original conserva `.gitignore` e `frontend/next-env.d.ts` modificados. Metadados do container demo mantêm o mesmo ID, início em 2026-10-18T13:19:16.032191955Z e RestartCount=0. Nenhuma execução publica ou sinaliza as portas 3000/3001; na inspeção final 3000 estava em escuta e 3001 não estava, sem intervenção deste trabalho.

## Complemento de 21/10/2026 — correção retroativa após mudança de tarifa

Acrescentado um único cenário em `backend/src/financial-rules/financial-rules.spec.ts`, reutilizando as fixtures isoladas, helpers HTTP e relógio de teste existentes. Sem alteração de seed demo, produção, schema ou migrations; sem novos cenários de transferência de cliente ou matriz de alocações.

Datas fixas em 2020: tarifa histórica de €10/h; em 30 de setembro, a API recusa início no próprio dia com 409 sem modificar tarifas e aceita €15/h a partir de 1 de outubro (D+1 em Lisboa). O teste verifica também o fecho da vigência histórica no milissegundo anterior. Trabalho de 15 de setembro com 480 minutos é faturado em €80. Com relógio em 10 de novembro, a API corrige esse trabalho para 360 minutos, conservando obra/cliente, dia, ofício e tarifa histórica: snapshot €10/h e valor €60. A nota associada é CREDIT_NOTE, DRAFT, novembro, €20; a linha mantém €10/h. Comparações integrais no banco comprovam que o registo faturado e a fatura original com linhas de €80 permanecem intactos. A tarifa de outubro a €15/h não reprecifica setembro.

O helper controla apenas Date; timers de rede/Prisma permanecem reais e a restauração ocorre em finally. Todos os dados pertencem ao PostgreSQL descartável do runner.

Validação: `sh scripts/test.sh baseline`, evidência `.test-results/20261021t100507z-1057314/`. **Exit 0: 63/63 backend e 10/10 frontend aprovados; builds backend/frontend, tipos e Prisma validate aprovados; diagnósticos com zero casos e nenhum banco secundário restante. Cleanup do projeto concluído (containers, rede, volume e imagem removidos).** Este modo executa backend/frontend, builds, tipos, Prisma e diagnósticos backend; não executa browser. Os drivers e a UI não mudaram neste complemento, por isso o comando completo/browser anteriormente aprovado não foi repetido. Nenhum novo defeito de produção confirmado.
