# Relatório da fase 2.3 - tarifas

`GET /rates?clientId=&tradeId=` e `POST /rates` são exclusivos de ADMIN. Listas completas, ordenadas por vigência/id; preços retornam strings com duas casas. POST: `{clientId,tradeId,hourlyRate,validFrom,validTo?}`; preço é string decimal positiva até 8 dígitos inteiros e 2 decimais, nunca float. Datas são dias `YYYY-MM-DD` em Europe/Lisbon; fim informado cobre o dia inteiro, inclusive.

A primeira tarifa admite início histórico. As seguintes começam no mínimo amanhã em Lisboa e depois da última vigência cadastrada. Uma nova tarifa fecha a anterior aberta a 1ms antes do início; tarifas finitas não são reabertas. Não se inserem vigências entre tarifas já programadas: rejeição 409 evita sobreposição e alteração de compromissos futuros. Sem edição/exclusão de preço ou reprecificação de horas antigas.

Um lock transacional por empresa serializa alterações financeiras. É intencionalmente mais amplo que cliente/ofício: o volume do exercício é pequeno e a ordem única será compartilhada com horas, correções e emissão, evitando deadlocks. Uso de `transaction` e RLS continua obrigatório. Precisão usa Prisma.Decimal, com HALF_UP em duas casas; horas multiplicam a tarifa histórica, não a de sincronização.

Verificação: build, Prisma validate e testes de tarifas em banco descartável, incluindo D+1, horário de verão, primeira tarifa histórica, precisão, futuras, referências/roles, concorrência e imutabilidade dos valores já precificados.
