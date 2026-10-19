# Relatório da fase 4.4 - faturação no frontend

ADMIN possui tarifas, prévia/emissão e documentos/ajustes. CLIENT usa somente GET /invoices e GET /invoices/:id, sem buscar clientes, preços ou dados operacionais. Componentes financeiros não calculam montantes: exibem strings devolvidas pelo servidor; formatação usa Intl/BigInt para a parte inteira e preserva os cêntimos sem float.

Tarifas recebem preço em string (vírgula de apresentação convertida para ponto), ofício/cliente e dias de Lisboa. Texto orienta D+1 para alterações e primeira vigência histórica; o backend decide. Não há edição de preços antigos.

Prévia mostra período real do trabalho, snapshots, minutos, montantes e pendências em seção separada. Explica que inclui trabalho anterior ainda não faturado, não faturas antigas por pagar. Alterar cliente/competência descarta a prévia; emissão envia exatamente o token retornado com o cliente/período correspondente. Botões pendentes ficam desativados. 409 exige refazer a prévia, sem emissão automática sobre valores alterados.

Documentos e notas possuem tipo/estado legíveis. ADMIN emite somente notas DRAFT pelos endpoints existentes. Detalhe mostra snapshots, vigências, registros/dias/horários e cadeia de versões; notas explicam diferença versus valor integral. Parent document e ajustes/líquido vêm da API. CLIENT não recebe identidade de trabalhador e não vê controles administrativos.

Verificação: typecheck, build e teste de formatação monetária sem perda de cêntimos. Revisão visual/fluxo integrado real é executada na fase 4.5. Não há PDF, email, pagamentos ou novos cadastros.
