# Relatório da fase 2.1 - contexto de persona e autorização

Na raiz: `docker compose up -d`. Em `backend`: copie `.env.example` para `.env`, execute `npm ci`, `npx prisma generate`, `npx prisma migrate deploy` e `npm run start:dev`. Use o seed somente para carga inicial; não é necessário repetir num banco já populado.

## Fase 2.1

- `GET /users/personas`: público, lista somente id, nome, papel e identificação/nome da empresa para o seletor de demonstração.
- `GET /users/me`: exige `x-user-id` (inteiro decimal positivo, sem zeros à esquerda). Exemplo: `curl -H 'x-user-id: 1' http://localhost:3001/users/me`.
- Header ausente, inválido ou persona inexistente: 401. Papel incompatível: 403. Recurso inexistente ou fora do escopo: 404. DTOs rejeitam campos extras com 400; erros internos retornam mensagem genérica.

O contexto imutável contém id, nome, companyId, role e clientId obtidos do banco. `x-user-id` simula identidade: qualquer pessoa pode trocar a persona, propositalmente. Não há login real. Bootstrap da persona e listagem pública são as únicas consultas da aplicação fora do tenant, com seleções explícitas.

A estrutura é direta: `AppModule` registra um único `AccessGuard` global. Esse guard resolve o header, coloca a persona na request e verifica os papéis definidos por `Roles`; `Public` libera somente rotas explicitamente públicas. `users/` contém controller, serviço de personas e os decorators/tipos de contexto. Não há módulo de autenticação separado. As regras de recurso ficam em `ScopeService`, fora do guard, usando o cliente `transaction`.

`ScopeService` oferece verificações reutilizáveis para serviços futuros, dentro de `withTenant` e usando somente `transaction`: ADMIN acessa a empresa; FOREMAN somente suas obras e registros dessas obras; WORKER somente seus registros; CLIENT somente suas faturas ISSUED. Projeções de trabalho não incluem valores financeiros. Não há endpoints de horas ou faturação nesta fase.

`withTenant` usa role e configuração locais à transação. O callback deve usar somente `transaction`; chamar o cliente principal escaparia da transação. O banco local usa conexão privilegiada para resolver personas: RLS não protege consultas que contornem o wrapper. Uma implantação real exige identidade validada, credenciais e bootstrap restritos. RLS limita empresa, não aplica sozinho permissões por papel/cliente. As FKs simples não garantem coerência de empresa entre referências; serviços devem validá-las.

## Verificação

`npx prisma validate`, `npm run build`, `npm test -- --runInBand`.

Os testes de integração exigem o container local `fonsat_postgres` e DATABASE_URL configurada. Criam um banco descartável separado, aplicam a migration e inserem fixtures próprias. Não fazem reset nem seed do banco de desenvolvimento. O login de desenvolvimento precisa criar/apagar esse banco de teste. Testes cobrem HTTP, escopos e RLS real, incluindo rollback e contexto entre transações.

## Resultado da verificação

Build e Prisma validate aprovados; 16 testes de integração aprovados na versão simplificada, incluindo reutilização da mesma conexão após commit e rollback. Os bancos descartáveis foram removidos após os testes.
