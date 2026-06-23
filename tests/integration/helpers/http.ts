// Typed body reader for handler responses. `Response.json()` resolves to `any`;
// narrow it once here so tests stay free of unsafe-any lint noise.
export async function readJson<T>(res: Response): Promise<T> {
  return await res.json();
}
