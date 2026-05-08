import axios, { AxiosInstance } from "axios";
import { META_API_BASE_URL } from "../constants.js";
import { MetaApiResponse } from "../types.js";

let client: AxiosInstance | null = null;

export function getMetaClient(): AxiosInstance {
  if (!client) {
    const token = process.env.META_ACCESS_TOKEN;
    if (!token) {
      throw new Error(
        "META_ACCESS_TOKEN environment variable is not set. " +
        "Get your token from: https://developers.facebook.com/tools/explorer/"
      );
    }

    client = axios.create({
      baseURL: META_API_BASE_URL,
      params: { access_token: token },
      timeout: 30000,
    });

    // Response error interceptor
    client.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        if (axios.isAxiosError(error) && error.response?.data?.error) {
          const metaErr = error.response.data.error;
          throw new Error(
            `Meta API Error [${metaErr.code}]: ${metaErr.message} (type: ${metaErr.type})`
          );
        }
        throw error;
      }
    );
  }
  return client;
}

export async function metaGet<T>(
  path: string,
  params: Record<string, unknown> = {}
): Promise<T> {
  const api = getMetaClient();
  const response = await api.get<MetaApiResponse<T>>(path, { params });
  return response.data as T;
}

export async function metaPost<T>(
  path: string,
  data: Record<string, unknown> = {}
): Promise<T> {
  const api = getMetaClient();
  const response = await api.post<T>(path, data);
  return response.data;
}

export async function metaGetPaged<T>(
  path: string,
  params: Record<string, unknown> = {},
  limit = 50
): Promise<T[]> {
  const api = getMetaClient();
  const results: T[] = [];
  let nextUrl: string | null = null;

  const firstResponse = await api.get<MetaApiResponse<T[]>>(path, {
    params: { ...params, limit },
  });

  results.push(...(firstResponse.data.data || []));
  nextUrl = firstResponse.data.paging?.next || null;

  // Follow up to 5 pages
  let page = 0;
  while (nextUrl && page < 5) {
    const pageResponse = await axios.get<MetaApiResponse<T[]>>(nextUrl);
    results.push(...(pageResponse.data.data || []));
    nextUrl = pageResponse.data.paging?.next || null;
    page++;
  }

  return results;
}

export function truncate(text: string, limit: number): string {
  if (text.length <= limit) return text;
  return text.slice(0, limit) + `\n\n[Output truncated at ${limit} characters]`;
}

export function formatCurrency(amount: string | undefined, currency = "HUF"): string {
  if (!amount) return "N/A";
  const num = parseFloat(amount) / 100; // Meta stores in cents
  return `${num.toLocaleString("hu-HU")} ${currency}`;
}

export function getActionValue(actions: { action_type: string; value: string }[] | undefined, type: string): number {
  if (!actions) return 0;
  const action = actions.find((a) => a.action_type === type);
  return action ? parseFloat(action.value) : 0;
}
