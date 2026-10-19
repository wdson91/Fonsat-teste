# Fase 2 — Backend de assiduidade e faturação

## 1. Decisões e critérios de conclusão

Implementar o caminho **alocação → registro de horas → resolução de divergências → cálculo → faturação**, preservando histórico e isolamento por empresa.

Decisões fechadas:

- A grelha envia somente turnos completos, com entrada e saída no mesmo dia. Rascunhos incompletos ficam no dispositivo.
- O encarregado corrige registros existentes; não faz lançamentos antecipados.
- Não existe aprovação obrigatória de todos os envios.
- Divergências entre entrada e saída quanto a obra/ofício, ou diferenças em relação à alocação, geram pendência para o encarregado.
- Alterações de tarifas existentes começam, no mínimo, em D+1. A primeira tarifa pode cobrir trabalho antigo ainda sem preço.
- A fatura inclui trabalho elegível do mês e de meses anteriores ainda não faturado.
- Pendências não bloqueiam a emissão dos valores resolvidos.
- Conferência por prévia calculada; persistência da fatura na emissão.
- Sem login real, PDFs, emails ou CRUDs acessórios.

A fase termina quando os quatro papéis conseguem executar seus fluxos, sem duplicar trabalho nem cobrança, com valores explicáveis pelo histórico.

## 2. Etapas de implementação

### 2.1 — Fundação da API e permissões

- Resolver a persona por `x-user-id`, carregando empresa, papel e cliente associado pelo cadastro.
- Criar contexto de requisição, guards, DTOs e tratamento uniforme de erros.
- Não aceitar empresa, trabalhador, estado ou valores calculados do payload como autoridade.
- Executar todas as operações de negócio pelo cliente transacional de `withTenant`.
- Validar que referências relacionadas pertencem à mesma empresa; RLS sozinho não garante essa consistência.

| Papel | Permissões |
|---|---|
| Trabalhador | Consultar suas alocações e registros; enviar suas próprias horas, sem acesso aos preços e valores financeiros. |
| Encarregado | Distribuir trabalhadores e resolver/corrigir registros nas obras sob sua responsabilidade. |
| Administrativo | Mesmas operações em todas as obras da empresa; atribuir encarregados, gerir preços e faturação. |
| Cliente | Consultar somente suas faturas emitidas e a explicação dos valores. |

A listagem de personas será uma exceção explícita para a demonstração, retornando apenas identificação, nome, papel e empresa. O header simula identidade; não prova quem envia o pedido.

**Entrega:** isolamento por empresa e autorização por papel funcionando antes das escritas de negócio.

### 2.2 — Obras, alocações e consultas de apoio

- Disponibilizar consultas de trabalhadores, clientes, ofícios, obras e alocações.
- Permitir ao administrativo atribuir o encarregado da obra.
- Criar e encerrar períodos de alocação, preservando a distribuição anterior.
- Validar os papéis das referências: trabalhador e encarregado precisam ter as funções correspondentes.
- Usar a data do trabalho para comparar o turno com a alocação vigente.
- Sem alocação compatível, encaminhar o trabalho para correção, preservando o envio.

Para divergências envolvendo duas obras, o encarregado da obra da entrada pode analisar o envio; o administrativo pode resolver qualquer caso. A resolução para outra obra exige responsabilidade sobre a obra de destino, ou intervenção do administrativo.

**Entrega:** distribuição consultável por período e mudanças de alocação sem perder histórico.

### 2.3 — Tarifas e cálculo

- Consultar e cadastrar tarifas por cliente e ofício, restritas ao administrativo.
- Usar `Europe/Lisbon` para o dia de negócio; vigências começam à meia-noite.
- Para tarifas existentes, aceitar início apenas amanhã ou depois, encerrando a vigência aberta anterior antes da nova.
- Impedir sobreposição, inclusive entre tarifas futuras já agendadas.
- Permitir primeira tarifa com início histórico para resolver horas sem preço, sem alterar valores já precificados.
- Determinar o preço pela data do trabalho; congelar tarifa e valor no registro.
- Usar `Prisma.Decimal`; devolver dinheiro como strings decimais.

Somar durações e arredondar os minutos uma vez por agrupamento. Calcular o valor a partir dos minutos persistidos, com arredondamento para dois decimais.

**Entrega:** preços futuros e históricos corretos, sem recalcular trabalho já precificado.

### 2.4 — Eventos, deduplicação e pendências

Receber `{ events: [...] }` com `id`, `shiftId`, `siteId`, `tradeId`, `kind` e `occurredAt`.

**Validação estrutural**
- Exigir exatamente uma entrada e uma saída por turno, com horários válidos e saída posterior à entrada.
- Recusar turnos entre dias, marcações futuras e referências inexistentes ou de outra empresa.
- Recusar sobreposição de horários do mesmo trabalhador.
- A ordem de chegada dos eventos não determina sua ordem temporal.

**Classificação**
- Turno consistente e compatível com alocação: consolidar por trabalhador, dia, obra e ofício.
- Com tarifa: `ACTIVE`.
- Sem tarifa: `PENDING_RATE`.
- Obra/ofício divergente entre os eventos, ou incompatível com alocação: `PENDING_CORRECTION`, sem cobrança.

Os eventos originais ficam em `eventsJson`. Para uma divergência interna, a referência provisória de obra/ofício é a da entrada; o JSON preserva também os valores da saída. Os minutos decorridos podem ser calculados, mas tarifa e valor permanecem vazios até a resolução.

Turnos divergentes são guardados separadamente dos agrupamentos regulares para não tornar pendente trabalho correto.

**Reenvios**
- Mesmo ID e conteúdo: reconhecer como recebido.
- Mesmo ID com conteúdo diferente: responder conflito, preservando o original.
- Lotes mistos processam somente os eventos novos.
- A deduplicação e a gravação acontecem na mesma transação.
- Um reenvio não restaura eventos antigos que já foram corrigidos.

**Entrega:** receber horas válidas, preservar divergências e impedir duplicação por reenvio.

### 2.5 — Correções e versões

- Exigir autorização, motivo e registro da pessoa que realizou a correção.
- Resolver divergências escolhendo explicitamente obra e ofício corretos para o turno; não inferir uma divisão de horas entre obras.
- O encarregado pode confirmar uma exceção legítima à alocação, com motivo.
- Antes da emissão, criar nova versão com `replacesRecordId` e marcar a anterior como `SUPERSEDED`, atomicamente.
- Preservar todos os demais dados do registro anterior.
- Resolver `PENDING_RATE` pelo mesmo fluxo de versões.
- Se ainda existir outro impedimento, a nova versão permanece no estado de pendência correspondente.

Novos turnos de um agrupamento ainda não faturado consolidam-se com sua versão atual, sem reinserir códigos de eventos já recebidos. Escritas concorrentes são serializadas por trabalhador/dia, evitando duas versões atuais.

**Depois da emissão**
- Preservar o registro faturado e a fatura.
- Criar correção por `correctsInvoicedRecordId`, mantendo a tarifa histórica.
- Gerar crédito ou débito apenas pela diferença ainda não ajustada.
- Correção sem efeito financeiro fica no histórico, sem nota de valor zero.
- Resolver o ajuste em rascunho existente antes de emitir outro ajuste sobre o mesmo registro.

**Entrega:** histórico reconstruível e correções sem sobrescrever os valores originais.

### 2.6 — Faturação com saldo de trabalho anterior

A competência escolhida determina o limite final, mas **não cria um limite inicial para os registros elegíveis**.

Exemplo: a fatura de novembro inclui trabalho de novembro e registros elegíveis de outubro ou meses anteriores que ainda não foram faturados.

**Prévia**
- Selecionar registros atuais `ACTIVE`, do cliente, com data anterior ao início do mês seguinte e ainda não faturados.
- Excluir `SUPERSEDED`, `PENDING_RATE`, `PENDING_CORRECTION` e registros de ajustes financeiros.
- Mostrar as pendências separadamente, sem bloquear os valores resolvidos.
- Identificar o período real do trabalho em cada item, inclusive valores de meses anteriores.
- Somar valores já arredondados dos registros para evitar diferenças de cêntimos.

**Emissão**
- Recalcular sob bloqueio transacional e comparar com a prévia confirmada.
- Se os dados mudaram, retornar conflito e solicitar nova conferência.
- Criar documento, itens, snapshots e associações numa transação.
- Serializar emissão, consolidação e correção dos mesmos registros.
- Impedir que duas emissões cobrem o mesmo trabalho.

**Trabalho tardio**
- Um turno novo recebido após a emissão não altera a fatura anterior.
- Fica disponível para a próxima emissão, mesmo sendo de um mês anterior.
- Continua usando a tarifa da data do trabalho.

O transporte para o mês seguinte é de **trabalho ainda não faturado**, não de faturas emitidas e ainda não pagas. Gestão de pagamentos não entra nesta fase.

**Entrega:** emissão com valores acumulados não faturados e explicação histórica ao cêntimo.

## 3. Banco e contratos

### Ajustes mínimos de banco

O schema já possui `ACTIVE`, `PENDING_RATE`, `SUPERSEDED` e `replacesRecordId` único. Acrescentar:

- `PENDING_CORRECTION` ao enum.
- Permissão no trigger para transição de `PENDING_CORRECTION` para `SUPERSEDED`, preservando os demais campos.
- Migration incremental para qualquer diferença entre o schema, a migration existente e o banco aplicado.

Manter `totalMinutes` obrigatório, sem tabela `Shift`, `PENDING_REVIEW` ou `REJECTED`. As pendências têm pares completos; o problema é sua atribuição, não a falta de marcações.

### Grupos da API

| Grupo | Operações |
|---|---|
| `users` | Persona atual e opções da demonstração. |
| `sites` / `allocations` | Consultas, atribuição de encarregado, criação e encerramento de alocações. |
| `rates` | Consulta e cadastro de vigências. |
| `attendance` | Envio de eventos, consulta, histórico, pendências e correções. |
| `invoices` | Prévia acumulada, emissão, detalhe e documentos de ajuste. |

Sem endpoint genérico para alterar estados. Estados são definidos pelas operações de domínio autorizadas.

## 4. Validação e entrega

Cada etapa inclui testes focados; a fase 3 amplia a suíte completa.

Cenários obrigatórios:

- Dois tenants e permissões dos quatro papéis.
- Reenvio integral, lote misto e duplicação concorrente.
- Divergência entre entrada/saída e incompatibilidade com alocação.
- Correção de pendência mantendo eventos originais.
- Tarifa existente recusada para hoje/passado; futura aceita.
- Primeira tarifa histórica resolvendo `PENDING_RATE`.
- Substituição antes da emissão e imutabilidade após emissão.
- Trabalho de outubro recebido depois da fatura e cobrado em novembro.
- Pendência antiga excluída da cobrança e incluída após resolução.
- Crédito, débito, ajustes sucessivos e ausência de dupla cobrança.
- Mudança entre prévia e emissão.
- Cliente consultando somente suas faturas emitidas.

Ao concluir, documentar contratos, exemplos e decisões. Manter os dados de demonstração compatíveis com os novos cenários, sem apagar históricos nem depender de recriar o banco.
