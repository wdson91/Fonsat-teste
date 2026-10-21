# Decisões — Assiduidade e Faturação

Prioridades: simplicidade, valores explicáveis ao cêntimo, histórico preservado e isolamento entre empresas.

## Identidade, planeamento e registo

| Ambiguidade | Decisão | Justificação |
| --- | --- | --- |
| Como identificar pessoas sem login real? | `x-user-id` seleciona a persona; o guard resolve empresa e um dos quatro papéis no banco. O cliente comercial está ligado por `User.clientId`. | Permissões independem da interface e dos nomes. Sem autenticação real. |
| O planeamento define horários e admite vários encarregados? | Cada obra tem um encarregado responsável. A distribuição define obra e ofício; `Allocation.tradeId` é obrigatório, com sugestão do ofício habitual. Não define horas planeadas. | Mantém o planeamento simples; a cobrança depende do trabalho efetivamente registado, não de uma previsão de horas. |
| Receber entradas/saídas isoladas ou turnos completos? | Só enviar pares completos, também validados no backend. Incompletos ficam em `localStorage`, por empresa/utilizador, na chave `fonsat:worker:v1:companyId:personaId`. Envio manual, sem primeiro acesso offline por PWA. | Evita reconciliar marcações incompletas no servidor. Conserva rascunhos offline na interface já carregada. |
| Como tratar reenvios e trabalho diferente da alocação? | UUID de evento/turno estáveis: replay idêntico é ignorado; ID igual com conteúdo diferente devolve 409. Divergências ficam em `PENDING_CORRECTION`, sem valor, para revisão. | Falhas de rede não duplicam nem sobrescrevem trabalho; imprevistos ficam registados sem cobrança prematura. |

## Tempo, tarifas e valores

| Ambiguidade | Decisão | Justificação |
| --- | --- | --- |
| Como consolidar durações e definir o dia? | `WorkRecord` por trabalhador/dia/obra/ofício. Preservar eventos, somar durações e arredondar o total em minutos para inteiro, sem truncar os instantes. Calendário em `Europe/Lisbon`, incluindo mudanças de hora. Não definir limite máximo diário de horas de trabalho; validar horários e sobreposições. | Mantém o cálculo rastreável e evita inventar um teto ou adicionais de horas extra. O fuso do dispositivo não muda competências. |
| Qual tarifa usar quando o preço muda? | Tarifa por cliente/ofício, com vigências sem sobreposição. A primeira pode ser histórica; as seguintes começam em D+1 em Lisboa ou depois, sempre após a última vigência programada. Fechar a anterior aberta no milissegundo precedente. | Preserva o preço acordado quando o trabalho ocorreu e impede reprecificação histórica. A primeira tarifa pode resolver horas ainda sem preço. |
| Preço de venda e remuneração são distintos? | Usar uma única tarifa horária para valorizar o trabalho e cobrar ao cliente, sem modelar remuneração separada ou folha de pagamento. Guardar referência da tarifa, preço e montante no registo. | Simplificação; não calcula nem paga salários. |
| Quando arredondar e o que fazer sem preço? | Montante por registo: `round((minutos / 60) × tarifa, 2)`, com Decimal; faturas somam montantes já arredondados. Sem tarifa: `PENDING_RATE`, minutos preservados e montante nulo. | Evita desvios monetários e cobrança a zero por falta de cadastro. Pendências aguardam resolução sem bloquear a faturação dos registos resolvidos. |

## Faturação, correções e isolamento

| Ambiguidade | Decisão | Justificação |
| --- | --- | --- |
| Uma única fatura por cliente/mês? | Permitir faturas complementares da mesma competência, apenas com trabalho ainda não faturado, incluindo atrasados. Prévia sem escrita, token contra desatualização, transações e locks na emissão. | No negócio é comum existir mais de uma fatura. Os vínculos trabalho→linha→fatura evitam dupla cobrança no fluxo da API e identificam a origem de cada ajuste. |
| Como corrigir antes e depois da emissão? | Antes: transação marca a versão anterior `SUPERSEDED` e cria outra com motivo/autor. Depois: original intacto, nova versão e crédito/débito DRAFT pela diferença face ao original e ajustes emitidos. Zero não gera nota; rascunho bloqueia nova correção do mesmo trabalho. Mudar cliente após emissão é bloqueado. | Corrige sem apagar o passado nem cobrar novamente o valor integral. A nota fica ligada à fatura de origem; retificação entre clientes está fora deste fluxo. |
| Alterar cadastros pode mudar documentos anteriores? | Linhas conservam nomes da obra/ofício, preço, vigência, minutos e subtotal, ligadas aos registos. Triggers protegem o histórico. A grelha mostra os confirmados atuais sem sobrescrever rascunhos locais. | Explica documentos antigos e mostra correções, mantendo originais auditáveis. |
| Como impedir acesso entre empresas? | Company é a empresa isolada; Client pertence a essa empresa. Serviços aplicam papel/âmbito e `withTenant` define role/contexto local à transação para RLS no PostgreSQL. | RLS isola empresas; não escolhe a fatura de um ajuste. Essa origem é determinada pelos vínculos financeiros. O bootstrap privilegiado é limitado à demonstração. |

## Entrega e limites

Next.js, NestJS e PostgreSQL/Prisma; controllers recebem pedidos e services concentram regras, privilegiando código legível e consistência. Testes Docker usam bancos descartáveis, separados do demo.

A fase 5 está concluída: `docker compose up --build` inicia frontend, API e banco, aplica migrações e inicializa o seed com segurança, preservando dados entre arranques. `sh scripts/test.sh` executa os testes num ambiente Docker isolado. Fora do âmbito: deploy de produção, PDFs/emails, CI/CD e CRUDs acessórios do cadastro inicial.

Em produção, integraríamos um serviço de faturação certificado, com configuração fiscal própria por empresa (`Company`). Cada empresa emitiria em seu nome e NIF, com séries próprias e um ATCUD por documento. Guardaríamos as referências fiscais nas faturas e notas, mantendo os vínculos aos trabalhos e o isolamento entre empresas.
