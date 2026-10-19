import { PageHeader, EmptyState } from '../../components/ui';
export default function SitesPage() {
  return (
    <>
      <PageHeader
        eyebrow="OPERAÇÕES"
        title="Obras e equipas"
        description="Distribuição de trabalhadores e acompanhamento de pendências."
      />
      <section className="card">
        <EmptyState title="Gestão de obras">
          As consultas e ações serão adicionadas na etapa de gestão.
        </EmptyState>
      </section>
    </>
  );
}
