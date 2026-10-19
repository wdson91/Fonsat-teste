# Relatório da fase 4.1 - base do frontend

Next.js 16.4.2 App Router, React 19.3.1, TypeScript e Tailwind CSS 4.3.3; versões confirmadas no registro npm e fixadas no lock. A documentação oficial do Next exige Node >=20.9; o projeto usa Node >=22.14 para também executar testes TypeScript nativos. Verificação local com Node 22.14.0. Referências: [instalação Next](https://nextjs.org/docs/app/getting-started/installation), [Tailwind](https://tailwindcss.com/docs/installation/framework-guides/nextjs).

Fetch direto à API pública configurada por NEXT_PUBLIC_API_URL; sem BFF, Redux, biblioteca de consulta ou UI. Tipos de contratos HTTP, sem Prisma no navegador. Base visual clara com navegação por papel, seletor agrupado por empresa, estados de carregamento/erro/vazio e aviso explícito de identidade simulada.

A seleção chama `/users/me` e usa a identidade devolvida pelo backend. Um contexto de persona, AbortController trocado na mudança e subtree com chave empresa/pessoa descartam estado e respostas da persona anterior. A seleção persiste separadamente dos futuros rascunhos. `/worker` é WORKER; `/sites` ADMIN/FOREMAN; `/billing` e `/invoices/:id` ADMIN/CLIENT. A API continua sendo autoridade de autorização; os destinos permitidos só organizam a navegação.

Erros HTTP: 400 exibe validações; 401 pede nova seleção; 403/404 explicam acesso/recurso; 409 exibe conflito e exige atualizar; falhas internas não mostram stack. Storage indisponível gera aviso. Build/typecheck validam esta base; funcionalidades das quatro telas entram nas etapas seguintes. Nenhuma publicação ou autenticação real.
