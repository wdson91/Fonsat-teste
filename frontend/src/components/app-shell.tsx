'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { canVisit, homeForRole, roleNames, useSession } from './session';
import { EmptyState, Notice } from './ui';

export function AppShell({ children }: { children: React.ReactNode }) {
  const { personas, selectedPersona, selectPersona, loading, error, storageWarning } = useSession();
  const pathname = usePathname(); const router = useRouter();
  useEffect(() => {
    if (selectedPersona && (pathname === '/' || !canVisit(selectedPersona.role, pathname))) router.replace(homeForRole(selectedPersona.role));
  }, [pathname, router, selectedPersona]);
  const companies = [...new Map(personas.map(persona => [persona.company.id, persona.company])).values()];
  const navigation = selectedPersona ? [
    ...(selectedPersona.role === 'WORKER' ? [{ href: '/worker', label: 'O meu ponto', icon: '◷' }] : []),
    ...(['ADMIN', 'FOREMAN'].includes(selectedPersona.role) ? [{ href: '/sites', label: 'Obras e equipas', icon: '▦' }] : []),
    ...(['ADMIN', 'CLIENT'].includes(selectedPersona.role) ? [{ href: '/billing', label: selectedPersona.role === 'CLIENT' ? 'As minhas faturas' : 'Faturação', icon: '▤' }] : []),
  ] : [];
  return <div className="app-shell">
    <aside className="sidebar"><Link href="/" className="brand"><span className="brand-icon">F</span><span>FONSAT<small>Operações de obra</small></span></Link>
      <div className="nav-label">ÁREA DE TRABALHO</div><nav aria-label="Navegação principal">{navigation.map(item => <Link key={item.href} href={item.href} className={pathname === item.href ? 'active' : ''}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
      <div className="sidebar-footer"><span className="live-dot"/> Ambiente de demonstração<small>Dados separados por empresa</small></div>
    </aside>
    <div className="workspace"><div className="topbar"><div className="company-name">{selectedPersona?.company.name ?? 'Assiduidade e faturação'}<span className="muted">{selectedPersona ? roleNames[selectedPersona.role] : 'Escolha a sua área de trabalho'}</span></div>
      <label className="persona-picker"><span>Persona de demonstração</span><select aria-label="Persona de demonstração" value={selectedPersona?.id ?? ''} onChange={event => void selectPersona(event.target.value ? Number(event.target.value) : null)}><option value="">Selecionar pessoa…</option>{companies.map(company => <optgroup key={company.id} label={company.name}>{personas.filter(persona => persona.companyId === company.id).map(persona => <option key={persona.id} value={persona.id}>{persona.name} · {roleNames[persona.role]}</option>)}</optgroup>)}</select></label>
    </div><main>{storageWarning && <Notice tone="warning">{storageWarning}</Notice>}{error && <Notice tone="error">{error}</Notice>}
      {loading ? <div className="loading" role="status">A confirmar a persona e a preparar a área de trabalho…</div> : !selectedPersona ? <section className="welcome card"><p className="eyebrow">BEM-VINDO AO FONSAT</p><h1>Da entrada em obra<br/>à fatura explicada.</h1><p className="muted">Selecione uma pessoa no topo para abrir a sua área. Cada papel vê apenas o trabalho que lhe compete.</p><div className="welcome-grid"><div><strong>01 / Registar</strong><p>Turnos completos, mesmo com pouca rede.</p></div><div><strong>02 / Organizar</strong><p>Equipas e correções com histórico.</p></div><div><strong>03 / Faturar</strong><p>Valores rastreáveis ao cêntimo.</p></div></div><Notice>O seletor simula identidade para este exercício. Não é um sistema de login.</Notice></section> : canVisit(selectedPersona.role, pathname) ? <div key={`${selectedPersona.companyId}:${selectedPersona.id}`}>{children}</div> : <EmptyState title="A abrir a área permitida">Esta persona não tem acesso a essa página.</EmptyState>}
    </main><footer className="workspace-footer">Fonsat · Assiduidade & faturação<span>Europe/Lisbon</span></footer></div>
  </div>;
}
