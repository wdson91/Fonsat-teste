# Fase 3.1 — base de testes Docker

Branch `fase-3.1/base-testes`, iniciada na main 42acffb. Criado checkout separado; alterações do checkout original e guia de estudo não foram incorporados. O plano completo e a matriz de revisão estão em [plano-fase-3.md](plano-fase-3.md).

O comando oficial é `sh scripts/test.sh`. O modo `sh scripts/test.sh baseline` executa testes backend/frontend, builds/tipos e validação Prisma, deixando os fluxos de browser para a execução completa. O host não precisa de Node, PostgreSQL ou Chromium. Dockerfile de testes usa Node 22.14.0, npm ci dos locks existentes, psql e Chromium instalado pelo Playwright 1.62.1. Não é o ambiente Docker de produção da fase 5.

Compose usa DNS postgres/checks, nenhum container_name fixo, nenhuma porta do host e nenhum socket/CLI Docker no runner. Cada execução recebe projeto/rede/volume próprios. O harness só aceita o banco de controlo fonsat_test_control no host postgres com role exclusiva de teste, cria nomes aleatórios fonsat_test e aplica migrations diretamente com psql. Nunca liga ao banco de demonstração. Cada suite e cada API de browser recebe um banco novo; cleanup do projeto elimina os recursos próprios inclusive em falha/interrupção tratável. Imagens de testes com tag do projeto também são removidas; o cache de build é reutilizável.

Baseline executado em Docker: **45/45 testes backend, 10/10 frontend**, build backend, build frontend, typecheck frontend e Prisma validate aprovados. Diagnósticos ainda sem casos confirmados, não equivalem a aprovação antecipada. Evidência: `.test-results/20261020t112108z-54608/`, incluindo JSON do Jest, logs e cleanup. O banco descartável não deixou bases secundárias; log confirma rede e volume removidos.

A orquestração agrega grupos e distingue falhas de infraestrutura de checks. Diagnósticos têm configuração/diretório separados; o comando completo inclui-os e falha se um defeito confirmado continuar a reproduzir-se. Próximas etapas ampliam apenas lacunas, sem alterar produção ou criar meta de percentagem de cobertura. O ambiente principal de desenvolvimento não foi encerrado ou resetado.
