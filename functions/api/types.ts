export type CradleEnv = {
  DB?: D1Database;
  APP_ENV?: string;
  API_VERSION?: string;
  APP_VERSION?: string;
  BUILD_SHA?: string;
  BUILD_TIME?: string;
  VALIDATED_TEST_COUNT?: string;
  EXPECTED_MIGRATION?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_REDIRECT_URL?: string;
};

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId: string;
};

export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, string>;
  };
  requestId: string;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;

export type JsonRecord = Record<string, unknown>;
