import type { DNSRecord } from "../shared/types";
import type { Env } from "./env";

interface CustomHostname {
  id: string;
  status: "pending" | "active" | "failed";
  records: DNSRecord[];
  errors: string[];
}
interface CloudflareCustomHostname {
  id: string;
  hostname: string;
  status: string;
  ssl?: { status?: string; validation_records?: Array<{ txt_name?: string; txt_value?: string }> };
  ownership_verification?: { type?: string; name?: string; value?: string };
  verification_errors?: string[];
}

const API_URL = "https://api.cloudflare.com/client/v4";
const FAILED_STATUSES = new Set(["blocked", "moved", "deleted", "test_failed"]);

const request = async <T>(env: Env, method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(
    `${API_URL}/zones/${env.CLOUDFLARE_ZONE_ID}/custom_hostnames${path}`,
    {
      method,
      headers: {
        authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
        ...(body !== undefined && { "content-type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    }
  );
  const result = (await response.json()) as {
    success: boolean;
    result: T;
    errors?: Array<{ message: string }>;
  };

  if (!result.success) {
    throw new Error(result.errors?.[0]?.message ?? "Cloudflare refused the request");
  }

  return result.result;
};
/** The records the owner adds: the CNAME to the sites host, and the TXT checks. */
const toCustomHostname = (env: Env, result: CloudflareCustomHostname): CustomHostname => {
  const isActive = result.status === "active" && result.ssl?.status === "active";
  const isFailed =
    FAILED_STATUSES.has(result.status) || result.ssl?.status === "validation_timed_out";
  const verification = result.ownership_verification;
  const records: DNSRecord[] = [
    { type: "CNAME", name: result.hostname, value: env.SITES_FALLBACK_HOST },
    ...(verification?.name && verification.value
      ? [{ type: "TXT" as const, name: verification.name, value: verification.value }]
      : []),
    ...(result.ssl?.validation_records ?? [])
      .filter((record) => record.txt_name && record.txt_value)
      .map((record) => ({ type: "TXT" as const, name: record.txt_name!, value: record.txt_value! }))
  ];

  return {
    id: result.id,
    status: isActive ? "active" : isFailed ? "failed" : "pending",
    records,
    errors: result.verification_errors ?? []
  };
};
/** A custom hostname on the sites zone, with a certificate validated by a TXT record. */
const createCustomHostname = async (env: Env, hostname: string): Promise<CustomHostname> => {
  const result = await request<CloudflareCustomHostname>(env, "POST", "", {
    hostname,
    ssl: { method: "txt", type: "dv" }
  });

  return toCustomHostname(env, result);
};
const getCustomHostname = async (env: Env, id: string): Promise<CustomHostname> => {
  return toCustomHostname(env, await request<CloudflareCustomHostname>(env, "GET", `/${id}`));
};
const deleteCustomHostname = async (env: Env, id: string): Promise<void> => {
  await request(env, "DELETE", `/${id}`);
};

export { createCustomHostname, getCustomHostname, deleteCustomHostname };
