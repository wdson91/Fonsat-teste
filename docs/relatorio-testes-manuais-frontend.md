# Frontend — execução do roteiro 1 a 11 com prints

Executado em **21/10/2026**, branch `ajustes`, base `d83e73f`, preservando o seed completo de `1e54b7e` e a correção da grelha de `4576ed1`. Resultado: **11/11 passos aprovados**, exit 0 e zero erros JavaScript. Esta execução foi automatizada por Playwright **pela interface real**: seleção de personas, preenchimento, envio, correções, prévias e emissões. Não é uma nova confirmação manual feita pelo utilizador nem uma sequência de escritas diretas na API.

## Ambiente e seed

PostgreSQL descartável, projeto `fonsat-manual-20261021t185257z-1716823`, sem portas do host ou acesso ao banco demo. API e Next.js construídos e executados dentro do container; Chromium **151.0.7922.34**, viewport 1440×1000, fuso Europe/Lisbon. Relógio real, sem alteração da máquina. A fase 5 não precisou de merge ou checkout: foi reutilizado o Docker de testes existente em ajustes.

A preparação executou o seed real somente no banco criado pelo harness seguro. Antes de abrir a interface, verificou **9 registos, zero PENDING_RATE**, referências de tarifa compatíveis com cliente/ofício e snapshots iguais aos preços históricos. Canalizador/Teixeira: ACTIVE, **240 minutos × €22/h = €88**. Prova: [seed-check.json](evidencias-testes-manuais/seed-check.json). Nenhuma expectativa foi adaptada para esconder pendência de preço.

## Resultados e evidências

Todos os resultados observados coincidiram com os esperados. Valores em euros. IDs **#4, #5 e #6** são desta execução, não um contrato para outros bancos.

| Passo | Operação e resultado observado | Prints |
| --- | --- | --- |
| **1 — aprovado** | Ana: prévia Teixeira outubro **232 = 144 + 88**. | [Prévia 232](evidencias-testes-manuais/01-previa-232.png) |
| **2 — aprovado** | Manuel, Boavista/Pedreiro, 19/10 08–16: **480 min/144**; prévia **376**. | [Trabalhador](evidencias-testes-manuais/02-trabalhador-480-min.png), [prévia 376](evidencias-testes-manuais/02-previa-376.png) |
| **3 — aprovado** | Carlos corrige saída para 15h: **420 min/126**, histórico preservado. Após troca de persona e reload, grelha bloqueada mostra 15h. Prévia **358**. | [Histórico](evidencias-testes-manuais/03-correcao-historico.png), [grelha atual](evidencias-testes-manuais/03-grelha-atual-15h.png), [prévia 358](evidencias-testes-manuais/03-previa-358.png) |
| **4 — aprovado** | Ana emite **fatura #4 de 358**. Nova prévia sem linhas/total 0: sem recobrança. | [Fatura](evidencias-testes-manuais/04-fatura-358.png), [prévia vazia](evidencias-testes-manuais/04-sem-dupla-cobranca.png) |
| **5 — aprovado** | Saída 14h: **360 min/108**. Crédito **#5 DRAFT de 18**, ligado à #4; cliente não vê o rascunho. Após emissão, original **358** e líquido **340**. | [Crédito DRAFT](evidencias-testes-manuais/05-credito-draft-18.png), [cliente sem rascunho](evidencias-testes-manuais/05-cliente-sem-rascunho.png), [emitido/líquido 340](evidencias-testes-manuais/05-credito-emitido-liquido-340.png) |
| **6 — aprovado** | Saída 14h30: **390 min/117**. Débito **#6 DRAFT de 9**, ligado à #4; após emissão, líquido **349 = 358 − 18 + 9**. | [Débito DRAFT](evidencias-testes-manuais/06-debito-draft-9.png), [líquido 349](evidencias-testes-manuais/06-liquido-349.png) |
| **7 — aprovado** | Ricardo consulta a #4 sem nome do trabalhador ou botões de emissão. Sofia não encontra a fatura Teixeira e recebe **404** ao navegar diretamente para o documento. | [Ricardo](evidencias-testes-manuais/07-cliente-teixeira.png), [Sofia: acesso negado](evidencias-testes-manuais/07-douro-acesso-negado.png) |
| **8 — aprovado** | Manuel, 12/09 08–09: **60 min a 15/h**. Trabalho atrasado entra na prévia novembro em **15**, sem ajustar a #4. | [Trabalho de setembro](evidencias-testes-manuais/08-atrasado-setembro.png), [prévia novembro 15](evidencias-testes-manuais/08-previa-novembro-15.png) |
| **9 — aprovado** | 20/10, Douro 08–09: `PENDING_CORRECTION`, separado da cobrança; Douro mantém **132**. Carlos confirma a exceção: **16,50**, prévia Douro **148,50**. | [Pendência](evidencias-testes-manuais/09-divergencia-pendente.png), [sem cobrança](evidencias-testes-manuais/09-pendente-sem-cobranca.png), [confirmação](evidencias-testes-manuais/09-excecao-confirmada.png), [148,50](evidencias-testes-manuais/09-douro-148-50.png) |
| **10 — aprovado** | Antes de faturar, Carlos corrige 20/10 para Boavista: **60 min/18**, sem nota. Douro volta a **132**; prévia Teixeira novembro **33 = 15 + 18**. | [Douro 132](evidencias-testes-manuais/10-douro-132.png), [Teixeira 33](evidencias-testes-manuais/10-teixeira-33.png) |
| **11 — aprovado** | Ana tenta Teixeira/Pedreiro **20/h** desde **21/10**: 409 e mensagem D+1. Desde **22/10**: aceite. A #4 mantém **358/líquido349**, e o atrasado mantém **15/h**, com prévia ainda **33**. | [Hoje recusado](evidencias-testes-manuais/11-tarifa-hoje-recusada.png), [amanhã aceite](evidencias-testes-manuais/11-tarifa-amanha-aceite.png), [fatura preservada](evidencias-testes-manuais/11-fatura-historica-preservada.png), [preços históricos](evidencias-testes-manuais/11-atrasado-preco-historico.png) |

27 PNGs, aproximadamente 3,3 MB, capturados da UI sem montagem. As telas de erro do passo 7 (404) e 11 (D+1) são os resultados negativos esperados. O relatório usa somente a execução final aprovada. Resultado estruturado: [results.json](evidencias-testes-manuais/results.json).

## Repetir

Na raiz, com shell, Docker e Compose:

```sh
sh scripts/test-manual-ui.sh
```

O [launcher](../scripts/test-manual-ui.sh) usa compose.test.yml + [override](../tests/compose.manual.yml). O [harness](../backend/test/manual-preview.mjs) cria o banco, aplica migrações, carrega/verifica o seed, constrói e inicia os servidores. O [roteiro Playwright](../frontend/qa/manual-steps.mjs) realiza as ações de negócio pelos controlos da interface; lê as respostas originadas por essas ações para conferir valores. Não substitui respostas nem chama endpoints para efetuar operações por fora da UI.

O teste usa datas fixas de setembro/outubro de 2026 e pressupõe execução após 20/10/2026. D+1 calcula hoje/amanhã pelo relógio real de Lisboa. Evidências novas ficam em `.test-results/fonsat-manual-<execução>/screenshots/`; os prints versionados aqui são os de 21/10. O cleanup remove somente containers, rede, volume e imagem do projeto criado.

## Limites e encerramento

O roteiro termina no **passo 11**; não executa o passo 12 ou os ajustes adicionais do ensaio anterior. Não emitiu a prévia complementar de 33. Nenhum defeito da aplicação foi confirmado neste roteiro. As tentativas iniciais exigiram corrigir seletores/sincronização do driver (resposta de página versus API, botões equivalentes, confirmação da persona e avisos semelhantes), sem alterar a aplicação ou as expectativas.

Não foi repetida a suíte completa, pois nenhuma regra/código de produção mudou. Esta tarefa acrescenta somente harness/roteiro, relatório e evidências. Builds backend/frontend passaram no ambiente do ensaio; git diff --check e sintaxe do launcher foram verificados. Banco descartável e recursos próprios removidos ao fim; banco/serviços do utilizador preservados. Sem push, PR ou merge.
