# Defeitos e questões da fase 3

Nenhum defeito de produção confirmado até à criação da base. Esta afirmação será atualizada pelos resultados executados; não representa aprovação antecipada da aplicação.

Diagnósticos backend: `backend/test/diagnostics/*.diagnostic.ts`, separados da suite principal por configuração própria. Diagnósticos browser: `frontend/qa/diagnostics/*.diagnostic.mjs`. O comando completo executa-os e retorna erro se falharem. Não são testes ignorados.

Cada defeito confirmado terá identificador, reprodução mínima, resultado esperado/observado, impacto, fonte e cenário executável. Ambiguidades de requisito serão questões explícitas, sem inventar novas regras. Falhas de infraestrutura ficam nas evidências e relatórios, não são classificadas automaticamente como defeitos de negócio.
