# Fase 3.3 — regras financeiras

Branch `fase-3.3/regras-financeiras`, sobre a 3.2. Acrescentados 7 cenários para lacunas concretas, preservando as suites financeiras existentes e sem alterar código de produção.

Casos novos: D+1 na fronteira em que Lisboa já mudou de dia e UTC não; alocação real de 25 horas no recuo DST com fim exclusivo; replay simultâneo e divergente com invariantes de registos/dedup; nomes/preço/vigência de snapshots após mudanças do cadastro; falha injetada na criação da versão depois do UPDATE de origem com rollback integral; competência com atrasados de duas tarifas históricas e soma explícita 0.33 + 0.42 = 0.75; turno com offsets explícitos no recuo DST conservando 75 minutos e o dia de Lisboa.

Relógio controlado apenas no teste, com restauração em finally; timers de rede/Prisma continuam reais. As datas do trabalho são fixas e históricas. As fixtures de cada caso têm cliente/ofício/trabalhador próprios para evitar dependência da ordem e falsos resultados financeiros. A injeção de falha é um trigger temporário no banco descartável, removido em finally, não uma alteração da aplicação.

Comando executado: `sh scripts/test.sh baseline`. Resultado Docker: **62/62 backend, 10/10 frontend**, builds, tipos e Prisma validate aprovados. Evidência `.test-results/20261020t113417z-72962/`; cleanup sem bancos secundários restantes e remoção dos recursos do projeto. A cadeia existente 80→70 antes de emitir→crédito10→débito5=65, DRAFT pendente, delta zero, prévia sem escrita/token, emissão concorrente/correção, atrasados e rollback de faturação continuam aprovados; não foram duplicados.

Nenhum novo defeito de produção confirmado nesta etapa. Diagnósticos continuam separados, sem casos inventados ou expectativas invertidas. A ambiguidade Q-01 mantém-se como limite da policy/constraint de vínculo contra SQL direto, não como brecha de API confirmada.
