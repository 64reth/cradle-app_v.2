import { requirePlatformOperator } from "../auth-provider";
import { handleApiRequest, methodNotAllowed, requireD1, success } from "../http";
import type { CradleEnv } from "../types";

type Context = { request: Request; env: CradleEnv };

export async function onRequestGet({ request, env }: Context): Promise<Response> {
  return handleApiRequest(request, async (requestId) => {
    const db = requireD1(env); await requirePlatformOperator(db, request);
    const query = new URL(request.url).searchParams.get("query")?.trim().slice(0, 80) || "";
    if (!query) return success({ accounts: [] }, requestId);
    const like = `%${query.replace(/[\\%_]/g, "\\$&")}%`;
    const accounts = await db.prepare(`SELECT a.id, a.account_reference AS accountReference,
      a.display_name AS displayName, s.account_status AS status, a.created_at AS createdAt,
      (SELECT group_concat(DISTINCT provider) FROM auth_identities WHERE account_id = a.id) AS providers,
      (SELECT count(*) FROM members WHERE account_id = a.id AND is_active = 1) AS membershipCount
      FROM user_accounts a JOIN account_security s ON s.account_id = a.id WHERE lower(a.account_reference) LIKE lower(?) ESCAPE '\\'
        OR lower(a.display_name) LIKE lower(?) ESCAPE '\\'
        OR a.id IN (SELECT account_id FROM auth_identities WHERE lower(email) LIKE lower(?) ESCAPE '\\')
      ORDER BY a.created_at DESC LIMIT 50`).bind(like, like, like).all();
    return success({ accounts: accounts.results.map((account) => ({ ...account, providers: account.providers ? String(account.providers).split(",") : [] })) }, requestId);
  });
}

export async function onRequest(context: Context): Promise<Response> {
  if (context.request.method === "GET") return onRequestGet(context);
  return handleApiRequest(context.request, () => { throw methodNotAllowed("GET"); });
}
