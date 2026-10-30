export async function withMockedFetch<T>(
  responder: (url: string) => Response | Promise<Response>,
  run: () => Promise<T>,
): Promise<T> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown) => Promise.resolve(responder(String(input)))) as unknown as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}
