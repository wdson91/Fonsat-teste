# Fase 5 — execução local com Docker

Branch `fase-5/execucao-docker`, criada da main `c3a1a01`. Checkout de trabalho: `/home/wdson/Github/Fonsat-fase5`. Implementação independente de ajustes: não inclui UI 4576ed1, seed 1e54b7e, tutorial 83855b1 ou revisões de DECISOES.md. Pode ser integrada **antes de ajustes**. Sem push, PR ou merge nesta entrega.

## Implementação

`docker compose up --build` constrói e inicia PostgreSQL 16, inicialização, NestJS e Next.js. Node 22.14.0 e npm ci com locks existentes; Prisma generate e builds nos containers. Mantidas as regras financeiras, schema Prisma, migrations e seed da main. A API já permite CORS para a demonstração; não foi necessário alterar código HTTP.

Projeto Compose padrão `fonsat-local`, sem container_name fixo, distinto do antigo projeto fonsat-teste. PostgreSQL não publica porta; frontend/API publicam apenas loopback. Volume app_database preserva dados e não reutiliza/apaga postgres_data antigo. Porta frontend 3000, API 3001; `.env.example` permite alterá-las. NEXT_PUBLIC_API_URL é uma configuração de build acessível pelo navegador (localhost:3001 por padrão), não DNS interno. Alterar a URL requer reconstrução.

Healthchecks coordenam PostgreSQL → initialize concluído → API saudável → frontend. initialize aplica `prisma migrate deploy`, sem reset. Se não houver estado anterior, verifica todas as 12 tabelas de negócio: só executa o seed destrutivo se todas estiverem vazias. Dados existentes sem marcador são preservados. A tabela técnica `_LocalInitialization`, fora dos modelos de negócio, regista started antes do seed e complete somente após sucesso. Falha/interrupção deixa started: o próximo arranque falha claramente, sem repetir TRUNCATE nem declarar sucesso falso. A recuperação exige revisão/restauro dos dados ou recriação explícita de um volume descartável; não há recuperação destrutiva automática.

README reduzido a execução, personas, persistência, testes e limites. Plano/fluxo identificam a fase 5 como empacotamento local implementado em branch própria; as referências históricas anteriores não significam deploy de produção. DECISOES.md não foi alterado, preservando a revisão independente em ajustes.

## Validação executada

Recursos exclusivos do projeto **fonsat-phase5-validation**, portas 33100/33101; volume/rede próprios. Comando de arranque:

```sh
API_PORT=33101 WEB_PORT=33100 NEXT_PUBLIC_API_URL=http://localhost:33101 docker compose -p fonsat-phase5-validation up --build -d --wait
```

Evidências em `.test-results/fase5/`:

- Primeiro arranque vazio: migrations e seed concluídos; initialize exit 0, API/frontend healthy; API devolveu 12 personas e frontend respondeu HTTP 200.
- Browser Chromium real contra a aplicação empacotada: seletor e quatro papéis (WORKER, FOREMAN, ADMIN, CLIENT), screenshot app.png e zero pageerrors; browser.log aprovado. Complementa o smoke financeiro completo abaixo.
- Persistência: inserido sentinel apenas no banco descartável. Antes/depois de down sem volumes e up: **3 empresas (2 seed + sentinel), 12 utilizadores, 9 WorkRecords, 3 faturas**, estado complete. Comparação integral dos snapshots before.json/after.json aprovada; nenhum novo seed no reinício.
- Inicialização incompleta simulada pelo estado started: initialize retornou **1** com mensagem explícita, sem alterar as contagens. Estado restaurado apenas no banco de validação e snapshot novamente comparado.
- Banco não vazio sem marcador: initialize retornou 0 e registou seed não executado. Sentinel e contagens preservados; marcador restaurado apenas para o ensaio. Logs nonempty.log e after-nonempty.json.
- `sh scripts/test.sh`, execução `.test-results/20261021t170924z-1583144/`: **exit 0, 63/63 backend, 10/10 frontend, 12 cenários smoke e 7 de distribuição**; builds, tipos e Prisma validate aprovados. Diagnósticos backend/browser sem casos; zero bancos secundários restantes. Os comandos/recursos de testes continuam independentes da aplicação.

Os ensaios de marcador simulam o estado persistente deixado por uma interrupção; não provocaram falha real do seed. Não foi executado seed, reset, migração ou escrita no banco demo do utilizador. A main ainda contém o exemplo PENDING_RATE e os dados históricos originais do seed; esta fase não os corrige nem importa mudanças de ajustes. A alteração posterior do seed não o reaplica automaticamente sobre volumes já inicializados.

## Limites e integração

Entrega local de demonstração: sem autenticação real, deploy de produção, CI/CD, conformidade fiscal ou integração AT. Imagens mantêm dependências de build para simplicidade, incluindo ts-node necessário ao seed. Credenciais locais de demonstração, sem gestão de segredos de produção. Docker/Compose e internet no primeiro build são requisitos do host.

Não executar o Compose antigo contra o banco atual para validar esta entrega. Ao integrar, o comando normal usa outro projeto/volume; dados antigos precisam de uma migração operacional deliberada, não de TRUNCATE. Down normal preserva dados; down --volumes remove-os.

No encerramento, apenas os recursos do projeto de validação são removidos. O worktree permanece com HEAD destacado no commit final para libertar a branch: o projeto normal continua em ajustes e só recebe a fase 5 após integração ou checkout explícito da branch, com alterações locais previamente preservadas.
