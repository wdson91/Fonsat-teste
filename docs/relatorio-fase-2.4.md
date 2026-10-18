# Relatório da fase 2.4 - apontamentos

`POST /attendance/events` é exclusivo de WORKER e recebe `{events:[{id,shiftId,siteId,tradeId,kind,occurredAt}]}`. IDs/shiftId são UUIDs, `kind` é `in|out`, data/hora ISO com segundos e offset. Cada turno exige exatamente um par no mesmo dia Europe/Lisbon, saída posterior, sem futuro ou sobreposição. Incompletos devem ficar no dispositivo; não há frontend nem lançamento manual pelo encarregado.

Obra/ofício divergentes ou ausência de uma alocação que cubra o turno completo não descartam as horas: geram um registro separado PENDING_CORRECTION, atribuído provisoriamente à entrada, com eventos de ambas as pontas, minutos obrigatórios e valores nulos. Referências inválidas ou de outra empresa continuam 404.

Turnos regulares agrupam dia/obra/ofício. Somam-se milissegundos e aplica-se Math.round uma vez aos minutos do grupo; dinheiro usa Decimal HALF_UP em duas casas. ACTIVE possui snapshot da tarifa da data real; sem tarifa gera PENDING_RATE. Sincronizar depois não resolve essa pendência automaticamente: é preciso uma nova versão na fase de correções.

ID repetido e conteúdo idêntico é ignorado; conteúdo diferente retorna 409. Lotes mistos consultam os pares originais pela deduplicação. IDs originais permanecem ligados à versão recebida; replay não reverte correção manual. Novos turnos consolidam em nova versão, marcando a anterior não faturada SUPERSEDED. Trabalho tardio não altera registro emitido: cria suplemento não faturado. Todo lote, versões e dedup são atômicos.

`GET /attendance/records?workerId=&siteId=&from=&to=` retorna array ordenado, incluindo histórico. WORKER vê os próprios; FOREMAN apenas obras suas; ADMIN a empresa; CLIENT não acessa. Projeções não expõem preços ou valores.

A migration incremental acrescenta PENDING_CORRECTION e endurece o trigger de WorkRecord comparando todos os campos exceto status, incluindo id. Nenhuma migration aplicada foi editada. Testes aplicam todas as migrations em banco descartável. Locks: empresa antes de trabalhador, com regras de sobreposição e rollback. Verificações incluem agrupamento, arredondamento, pendências, replay/misto/conflito, concorrência, referências e proteção do histórico.
