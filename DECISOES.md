# Decisões — Assiduidade e Faturação

Decisões tomadas perante as ambiguidades do enunciado, privilegiando simplicidade, valores explicáveis ao cêntimo, histórico de auditoria e isolamento entre empresas.

## 1. Arquitetura e âmbito da demonstração

Frontend em **Next.js**, API em **NestJS** e dados em **PostgreSQL**, acedidos por Prisma. No backend, controllers recebem os pedidos, services concentram as regras e o modelo persiste os dados. Esta separação mantém a lógica financeira no servidor e evita duplicá-la na interface.

Não há login real: `x-user-id` seleciona uma persona de demonstração. O guard procura essa pessoa no banco e determina empresa e papel; o frontend não escolhe as permissões. Autenticação real fica fora do âmbito.

## 2. Turnos completos, rascunhos e consolidação

A grelha semanal guarda rascunhos em `localStorage`, separados por empresa e utilizador. **Só envia turnos completos, com entrada e saída**, também validados pelo backend. Assim, não é necessário persistir marcações incompletas no servidor e reconciliá-las mais tarde para formar um turno. O utilizador controla o envio; não há envio automático nem garantia de primeiro acesso offline por PWA.

Os turnos são consolidados num `WorkRecord` por **trabalhador, dia, obra e ofício**. Somam-se as durações, convertem-se em minutos e arredonda-se o total para inteiro. Não foi definido um teto de horas de negócio; isso não dispensa validar horários e sobreposições. Os eventos originais ficam guardados para explicar o cálculo.

Os UUID de evento e turno mantêm-se nos reenvios. Um evento idêntico é ignorado sem duplicar ou sobrescrever trabalho; o mesmo ID com conteúdo diferente devolve 409. Isto permite repetir um envio após falha de rede ou perda da resposta.

Divergências de obra/ofício ou alocação ficam em `PENDING_CORRECTION`, sem valor financeiro. Sem tarifa aplicável, o trabalho mantém os minutos em `PENDING_RATE`, com montante nulo. Preserva-se o trabalho para resolução pelo Encarregado/Administrativo, sem o cobrar prematuramente.

## 3. Tarifas históricas, datas e dinheiro

A tarifa é negociada por **cliente e ofício**, com vigências sem sobreposição. A primeira pode ser histórica para resolver trabalho sem preço. Depois, novas vigências começam, no mínimo, em **D+1 em Europe/Lisbon** e depois da última vigência programada. Uma nova tarifa encerra a anterior aberta no milissegundo precedente; não reprecifica trabalho passado.

O `WorkRecord` guarda a referência da tarifa (`clientRateId`), o preço horário aplicado e o montante: `round((minutos / 60) × preço, 2)`. Preços e montantes usam `DECIMAL(10, 2)`; as faturas somam valores já arredondados. O calendário de negócio é o de Lisboa, incluindo mudanças de hora, para evitar diferenças nas fronteiras de dias e competências.

Cada linha de fatura conserva os nomes da obra/ofício, tarifa, vigência, minutos e subtotal, com vínculos aos registos de trabalho. Alterar o cadastro não muda documentos anteriores.

## 4. Correções e emissão sem apagar o passado

**Antes da emissão**, uma transação cria uma nova versão e marca a anterior como `SUPERSEDED`, preservando motivo, autor e ligação entre versões. Triggers e restrições no banco protegem o histórico contra alterações ou eliminações indevidas.

**Depois da emissão**, o registo e a fatura originais permanecem intactos. A correção cria uma versão ligada ao original e uma nota de crédito ou débito **DRAFT** apenas pela diferença face ao original e ajustes já emitidos. Diferença zero não gera nota; uma nota pendente bloqueia nova correção. Mudar de cliente após emissão é bloqueado e exige retificação comercial separada, fora deste fluxo.

A prévia não grava dados e inclui trabalho resolvido ainda não faturado, mesmo de competências anteriores; pendências não impedem cobrar os restantes registos. Um token rejeita prévias desatualizadas. Transações e locks evitam dupla cobrança em emissões concorrentes.

## 5. Isolamento e limites da entrega

**Company é a empresa isolada; Client é um cliente dessa empresa.** Os serviços limitam o acesso pelo papel e âmbito da persona. O PostgreSQL acrescenta RLS nas tabelas de negócio: `withTenant` define role e contexto da empresa apenas durante a transação. O bootstrap privilegiado das personas é uma concessão da demonstração, não autenticação de produção.

Os testes usam Docker e PostgreSQL descartável, separados do banco demo. A infraestrutura de produção fica para a fase 5, após frontend (4) e testes (3).

Ficam fora do âmbito PDFs/emails, CI/CD e CRUDs acessórios do cadastro inicial, fornecido por seed. Certificação AT, exportação SAF-T, IVA/retenções e numeração fiscal exigiriam trabalho próprio: os snapshots e documentos retificativos são uma base de rastreabilidade, não uma garantia de conformidade fiscal de produção.
