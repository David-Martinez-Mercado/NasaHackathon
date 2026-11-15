/** Minimal GraphQL client (fetch). The server URL comes from VITE_API_URL; nothing is hardcoded to a machine. */

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/graphql';

export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
  }
}

interface GraphQLResponse<T> {
  data?: T | null;
  errors?: { message: string; extensions?: { codigo?: string } }[];
}

export async function gql<T>(query: string, variables?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('Cannot reach the server. Check that the backend is running.', 'SIN_CONEXION');
  }
  let body: GraphQLResponse<T>;
  try {
    body = (await response.json()) as GraphQLResponse<T>;
  } catch {
    throw new ApiError(`The server answered with an unexpected response (${response.status}).`, 'RESPUESTA_INVALIDA');
  }
  if (body.errors?.length) throw new ApiError(body.errors[0].message, body.errors[0].extensions?.codigo);
  if (!body.data) throw new ApiError('The server returned no data.', 'SIN_DATOS');
  return body.data;
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
