export async function readJsonResponse<T>(response: Response, service: string): Promise<T> {
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    if (!response.ok) throw new Error(`${service} is temporarily unavailable. Try again.`);
    throw new Error(`${service} returned an invalid response.`);
  }
}
