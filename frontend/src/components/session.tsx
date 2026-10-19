'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { apiRequest, errorMessage } from '../lib/api';
import type { ConfirmedPersona, Persona, Role } from '../lib/contracts';

interface Session {
  personas: Persona[];
  selectedPersona: ConfirmedPersona | null;
  loading: boolean;
  error: string;
  storageWarning: string;
  selectPersona: (id: number | null) => Promise<void>;
  signal: AbortSignal | undefined;
}
const SessionContext = createContext<Session | null>(null);
const selectionKey = 'fonsat:persona';
export const roleNames: Record<Role, string> = {
  WORKER: 'Trabalhador',
  FOREMAN: 'Encarregado',
  ADMIN: 'Administrativo',
  CLIENT: 'Cliente',
};
export function homeForRole(role: Role) {
  return role === 'WORKER'
    ? '/worker'
    : role === 'FOREMAN'
      ? '/sites'
      : '/billing';
}
export function canVisit(role: Role, path: string) {
  if (path === '/') return true;
  if (path === '/worker') return role === 'WORKER';
  if (path === '/sites') return role === 'ADMIN' || role === 'FOREMAN';
  if (path === '/billing' || /^\/invoices\/\d+$/.test(path))
    return role === 'ADMIN' || role === 'CLIENT';
  return false;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] =
    useState<ConfirmedPersona | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [storageWarning, setStorageWarning] = useState('');
  const [signal, setSignal] = useState<AbortSignal>();
  const activeRequest = useRef<AbortController | null>(null);
  const catalog = useRef<Persona[]>([]);

  const selectPersona = useCallback(async (id: number | null) => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setSelectedPersona(null);
    setSignal(controller.signal);
    setError('');
    if (!id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const confirmed = await apiRequest<Omit<ConfirmedPersona, 'company'>>(
        '/users/me',
        id,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const company = catalog.current.find(
        (persona) => persona.companyId === confirmed.companyId,
      )?.company;
      if (!company) throw new Error('Empresa da persona não encontrada');
      setSelectedPersona({ ...confirmed, company });
      try {
        localStorage.setItem(selectionKey, String(id));
      } catch {
        setStorageWarning(
          'Não foi possível guardar a seleção neste navegador.',
        );
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(errorMessage(failure));
    } finally {
      if (activeRequest.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<Persona[]>('/users/personas', undefined, {
      signal: controller.signal,
    })
      .then(async (result) => {
        catalog.current = result;
        setPersonas(result);
        let stored: string | null = null;
        try {
          stored = localStorage.getItem(selectionKey);
        } catch {
          setStorageWarning(
            'Armazenamento local indisponível. A seleção funciona apenas nesta sessão.',
          );
        }
        if (
          stored &&
          /^[1-9]\d*$/.test(stored) &&
          result.some((persona) => persona.id === Number(stored))
        )
          await selectPersona(Number(stored));
        else setLoading(false);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) {
          setError(errorMessage(failure));
          setLoading(false);
        }
      });
    const unauthorized = () => {
      activeRequest.current?.abort();
      setSelectedPersona(null);
      setLoading(false);
      setError('Selecione uma persona válida para continuar.');
    };
    window.addEventListener('fonsat:unauthorized', unauthorized);
    return () => {
      controller.abort();
      activeRequest.current?.abort();
      window.removeEventListener('fonsat:unauthorized', unauthorized);
    };
  }, [selectPersona]);

  return (
    <SessionContext.Provider
      value={{
        personas,
        selectedPersona,
        loading,
        error,
        storageWarning,
        selectPersona,
        signal,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('SessionProvider não encontrado');
  return context;
}
