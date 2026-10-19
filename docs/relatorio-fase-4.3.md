# Relatório da fase 4.3 - gestão de obras

Tela `/sites` para ADMIN/FOREMAN, com consultas reais de obras, clientes, ofícios, trabalhadores/encarregados, alocações e registros. Filtros úteis por obra, trabalhador e período; fim exclusivo rotulado. Listas sem paginação. Não há cadastro geral de entidades.

ADMIN atribui encarregado via PATCH; ambos os papéis gerem alocações nas obras permitidas. Criar, encerrar e transferir usam os endpoints existentes, com datas/horas explicitamente de Lisboa e sem editar histórico. Fim definido torna o período somente leitura, conforme contrato. Transferência mostra origem e destino; conflitos são autoritativos no backend.

Registros atuais e histórico aparecem separados. Sem valores financeiros para encarregado. Correção exige motivo, seleciona destino/ofício e opcionalmente edita os pares completos já existentes; mantém IDs dos eventos, segundos dos horários não alterados e não cria apontamentos antes do envio do trabalhador. Só atribuição omite events. SUPERSEDED não oferece ação; resolução de PENDING_RATE exige motivo e usa tarifa histórica sem mostrar/cadastrar preço.

Resultado adjustmentId apenas informa o ajuste ao administrativo, sem valores no painel operacional. Após sucesso as consultas são atualizadas. 409 mantém o formulário, exibe conflito e recarrega dados; não sobrescreve a entrada do utilizador. A troca de persona aborta as consultas/mutações e desmonta o estado da tela.

Verificação: typecheck, build e testes focados, incluindo correção com UUIDs estáveis e preservação de segundos. Integração visual/real com quatro papéis e dois tenants é consolidada na fase 4.5.
