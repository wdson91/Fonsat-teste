# Fase 3.2 — isolamento e integridade

Branch `fase-3.2/isolamento-integridade`, sobre a 3.1. Acrescentada uma suite de PostgreSQL real com 10 cenários, sem alterar aplicação, schema ou migrations.

Verificações: RLS nas 12 tabelas de negócio (incluindo InvoiceLine e InvoiceLineWorkRecord pelas relações); role restrita sem contexto; WITH CHECK em mudança de empresa e em parents de linhas/vínculos; transições efetivas de WorkRecord com preservação de campos/NULL e proteção do faturado; emissão restrita de Invoice; fecho imutável de ClientRate; append-only; unicidades reais e direção de FK RESTRICT. Os testes existentes de quatro papéis, referências externas, transações de empresas simultâneas e pool de uma conexão continuam na suite, sem duplicação.

Comando executado: `sh scripts/test.sh baseline`. Resultado Docker: **55/55 backend, 10/10 frontend**, builds, typecheck e Prisma validate aprovados. Diagnósticos: zero casos confirmados nesta etapa. Evidência `.test-results/20261020t112852z-67523/`; resumo distingue no_cases de aprovação de testes inexistentes. Cleanup verificado: bancos secundários encerrados e projeto/rede/volume/imagem próprios removidos.

Limite importante: a unicidade de InvoiceLineWorkRecord é do par, não de workRecordId isolado. A policy desse vínculo usa a empresa do WorkRecord. Não se atribuiu ao banco uma validação de Company nas duas pontas que não está declarada; a questão Q-01 em defeitos-fase-3.md separa essa dúvida de requisito de um defeito confirmado de API. Nenhum defeito de produção foi corrigido ou ocultado.
