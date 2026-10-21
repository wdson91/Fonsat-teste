# Ajustes — grelha semanal após correção

Branch `ajustes`, criada de `main` em `c3a1a01`. O DECISOES.md local revisto acompanha esta entrega; a alteração gerada preexistente em frontend/next-env.d.ts fica fora do commit.

## Problema e solução

A tabela de registos confirmados já mostrava a versão atual, mas a grelha semanal continuava a apresentar o turno originalmente enviado e guardado no navegador. Após carregar os registos, a grelha passa a reconciliar apenas linhas confirmadas com os eventos das versões atuais, reutilizando currentRecords: exclui SUPERSEDED e seleciona a última correção de um registo faturado. Obra, ofício, dia e horários vêm dessa versão.

Cada turno é reconstruído pelo shiftId, preservando os vários turnos do registo consolidado. Rascunhos, envios em curso e tentativas pendentes mantêm os dados locais e payloads originais. Linhas existentes conservam a ordem; os confirmados permanecem bloqueados para o trabalhador. O resultado é guardado na mesma chave por empresa/utilizador, para que a versão corrigida continue disponível offline. Uma resposta falhada não apaga o cache. O histórico e as regras de imutabilidade do backend não mudam.

## Validação

Regressão unitária: 14:28→15:28 passa a 14:28→18:28, incluindo mudança de obra/ofício, múltiplos turnos, preservação do rascunho e replay, persistência/reload, isolamento da chave e seleção da última correção após faturação. A entrada não é modificada pelo helper.

Regressão no smoke: depois da correção pelo encarregado, o trabalhador vê 11:30 na grelha, bloqueado para edição, com o rascunho das 13:00 intacto; troca de persona e reload mantêm o resultado.

Comando: `sh scripts/test.sh`, Docker isolado sem usar o banco demo. A primeira execução encontrou uma regressão na ordem das linhas, corrigida antes do fechamento. Resultado final: **exit 0; 63/63 backend, 11/11 frontend, 13 cenários smoke e 7 verificações de distribuição aprovados**, builds, tipos e Prisma validate aprovados. Diagnósticos sem casos; zero bancos secundários restantes e cleanup dos recursos próprios concluído. Evidências em `.test-results/20261021t134037z-1335142/`.

Sem alteração de schema, migrations ou backend; sem incorporar o experimento abandonado de ajustes entre clientes. Sem push, PR ou merge.
