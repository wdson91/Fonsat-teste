# Frontend Fonsat

Node.js 22.14 ou superior. Backend em `http://localhost:3001`.

```sh
cp .env.example .env.local
npm ci
npm run dev
```

Abra `http://localhost:3000`. `NEXT_PUBLIC_API_URL` aponta diretamente à API NestJS; não contém segredo.

Verificar: `npm run typecheck` e `npm run build`.
Testes de datas/rascunhos/erros: `npm test`.

- [Base e personas](../docs/relatorio-fase-4.1.md)
- [Grelha e rascunhos](../docs/relatorio-fase-4.2.md)
- [Gestão de obras](../docs/relatorio-fase-4.3.md)
- [Faturação e documentos](../docs/relatorio-fase-4.4.md)
- [Integração, smoke real e capturas](../docs/relatorio-fase-4.5.md)
