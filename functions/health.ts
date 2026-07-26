import { handleApiRequest, requireD1, success } from "./api/http";
import type { CradleEnv } from "./api/types";

type HealthData = {
  service: "cradle";
  status: "ok";
  function: "ok";
  database: "ok";
  apiVersion: string;
  appVersion: string;
};

export async function onRequestGet(context: { request: Request; env: CradleEnv }): Promise<Response> {
  return handleApiRequest(context.request, async (requestId) => {
    const db = requireD1(context.env);
    await db.prepare("SELECT 1 AS ok").first();

    return success<HealthData>(
      {
        service: "cradle",
        status: "ok",
        function: "ok",
        database: "ok",
        apiVersion: context.env.API_VERSION || "v1",
        appVersion: context.env.APP_VERSION || "0.1.0"
      },
      requestId
    );
  });
}
