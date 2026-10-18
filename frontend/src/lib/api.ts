const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function apiErrorMessage(status: number, detail?: unknown): string {
  const message = Array.isArray(detail) ? detail.join(' · ') : typeof detail === 'string' ? detail : '';
  if (status === 401) return 'A persona já não está disponível. Selecione novamente.';
  if (status === 403) return 'Esta persona não tem permissão para esta operação.';
  if (status === 404) return 'O recurso não existe ou não está disponível para esta persona.';
  if (status === 409) return message || 'Os dados mudaram. Atualize e tente novamente.';
  if (status === 400) return message || 'Verifique os campos indicados.';
  return 'Não foi possível concluir a operação. Tente novamente.';
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return 'Sem ligação à API. Os dados locais foram preservados; verifique a rede e tente novamente.';
}

export async function apiRequest<Result>(path: string, personaId?: number, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<Result> {
  const response = await fetch(`${apiUrl}${path}`, {
    method: options.method ?? 'GET', signal: options.signal, cache: 'no-store',
    headers: { ...(personaId ? { 'x-user-id': String(personaId) } : {}), ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
  });
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('fonsat:unauthorized'));
    const detail = result && typeof result === 'object' && 'message' in result ? result.message : undefined;
    throw new ApiError(response.status, apiErrorMessage(response.status, detail));
  }
  return result as Result;
}
