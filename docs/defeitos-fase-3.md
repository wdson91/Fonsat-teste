# Defeitos e questões da fase 3

Nenhum defeito de produção confirmado nas verificações executadas até à fase 3.3. Esta afirmação será atualizada pelos resultados executados; não representa aprovação antecipada da aplicação.

Diagnósticos backend: `backend/test/diagnostics/*.diagnostic.ts`, separados da suite principal por configuração própria. Diagnósticos browser: `frontend/qa/diagnostics/*.diagnostic.mjs`. O comando completo executa-os e retorna erro se falharem. Não são testes ignorados.

Cada defeito confirmado terá identificador, reprodução mínima, resultado esperado/observado, impacto, fonte e cenário executável. Ambiguidades de requisito serão questões explícitas, sem inventar novas regras. Falhas de infraestrutura ficam nas evidências e relatórios, não são classificadas automaticamente como defeitos de negócio.

## Q-01 — coerência de Company nas duas pontas de um vínculo

Questão de escopo, não defeito confirmado de API. A policy tenant_isolation_invoice_line_work_record na migration inicial deriva a Company do WorkRecord. A FK do invoiceLineId referencia um ID global e não contém companyId; por si só, não prova que a InvoiceLine pertence à mesma Company. Os serviços não oferecem uma rota genérica para inserir esse vínculo e validam o fluxo financeiro.

É necessário definir se também se pretende uma garantia independente, no banco, de coerência das duas pontas contra SQL direto autorizado. Não foi imposta essa regra nova nem escrita expectativa invertida para aprovar um defeito. A suite verifica o isolamento e as escritas recusadas que as policies existentes declaram. Produção permanece intacta.

A condição Q-01 deve ser distinguida em três níveis: SQL privilegiado não é prova de bypass da API; SQL direto com INSERT sob app_tenant_user segue a policy que usa apenas a Company do WorkRecord; a API só constrói vínculos nos fluxos de faturação/correção com referências validadas e não expõe inserção genérica. Até esta etapa não foi confirmado um pedido HTTP autorizado que atravesse Company e exponha/corrompa dados. Se esse caminho for encontrado, terá diagnóstico de defeito, não será relegado a questão de escopo.
