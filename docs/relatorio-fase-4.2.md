# Relatório da fase 4.2 - grelha do trabalhador

Semana segunda–domingo, vários turnos por dia, navegação semanal, edição em grelha no desktop e cartões no telemóvel. Sugestões por alocação; outras obras/ofícios da empresa continuam selecionáveis com aviso de análise. Registros confirmados e histórico são leitura apenas; versões substituídas e correções do mesmo original não são somadas como trabalho adicional.

Rascunhos e catálogo mínimo ficam em localStorage com chave empresa/pessoa. Escrita automática ao editar. Corrupção, quota e bloqueio são visíveis; conteúdo corrompido não é sobrescrito automaticamente e pode ser descarregado antes de reinicialização explícita. Sem PWA ou abertura fria offline: pode continuar offline numa tela já carregada.

UUIDs de turno/evento são estáveis. O payload completo é persistido antes da primeira tentativa; só depois sai a requisição. POST sequencial por turno; uma falha não impede os restantes. Incompletos continuam locais; resultado desconhecido bloqueia edição e oferece reenvio do mesmo conteúdo. Sucesso só após resposta, incluindo replay com records vazio e ignoredEventIds. Consulta é atualizada após confirmação.

Conversão de dia/hora usa explicitamente Europe/Lisbon com Intl, sem fuso implícito do dispositivo. Horas inexistentes e ambíguas são recusadas. Mesmo dia, saída posterior e sem futuro são verificados antes do envio; o backend continua autoritativo.

Verificação: build/typecheck e cinco testes nativos do Node para verão/inverno/meia-noite, dispositivos em fusos diferentes, mudança de hora, UUIDs/payload após reload, isolamento de chave, storage corrompido/quota e mensagens HTTP. Verificação visual e rede real fazem parte da integração 4.5.
