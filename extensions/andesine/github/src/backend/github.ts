import { getMappedPath, type FileChange, type Mapping } from "../sync";
import type { Env } from "./env";
import { fromBase64, toBase64, toBase64URL } from "./base64";
import { verify } from "./signing";

interface Repository {
  id: number;
  owner: string;
  name: string;
  defaultBranch: string;
  private: boolean;
}
interface RepositoryRef {
  owner: string;
  name: string;
}
interface BranchHead {
  commit: string;
  tree: string;
}
interface TreeFile {
  path: string;
  sha: string;
}
interface Comparison {
  files: FileChange[];
  messages: string[];
}
/** A file to write (text or bytes), or null to delete it. */
interface CommitChange {
  path: string;
  content: string | Uint8Array | null;
}
interface CommitResult {
  sha: string;
  /** The branch head that the commit is on, which can be newer than the one the export read. */
  parent: string;
}

const API_URL = "https://api.github.com";
const COMPARE_FILE_LIMIT = 300;
const STATUSES: Record<string, FileChange["status"]> = {
  added: "added",
  copied: "added",
  removed: "removed",
  renamed: "renamed"
};
const tokens = new Map<string, { token: string; expiresAt: number }>();

class GitHubError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(`GitHub ${status}: ${message}`);
  }
}

const encodeLength = (length: number): number[] => {
  if (length < 0x80) return [length];

  const bytes: number[] = [];

  for (let rest = length; rest > 0; rest >>= 8) bytes.unshift(rest & 0xff);

  return [0x80 | bytes.length, ...bytes];
};
/** GitHub issues PKCS#1 keys; Web Crypto imports PKCS#8, so PKCS#1 is wrapped. */
const toPKCS8 = (pem: string): Uint8Array => {
  const isPKCS1 = pem.includes("BEGIN RSA PRIVATE KEY");
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  const der = fromBase64(body);

  if (!isPKCS1) return der;

  // version 0, rsaEncryption with NULL parameters, then the PKCS#1 key as an octet string.
  const prefix = [
    0x02, 0x01, 0x00, 0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01,
    0x05, 0x00
  ];
  const octets = [0x04, ...encodeLength(der.length)];
  const content = [...prefix, ...octets, ...der];

  return Uint8Array.from([0x30, ...encodeLength(content.length), ...content]);
};
const createAppJWT = async (env: Env): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: object) => toBase64URL(new TextEncoder().encode(JSON.stringify(value)));
  const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iat: now - 60, exp: now + 540, iss: env.GITHUB_APP_ID })}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    toPKCS8(env.GITHUB_APP_PRIVATE_KEY) as BufferSource,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );

  return `${unsigned}.${toBase64URL(new Uint8Array(signature))}`;
};
const request = async <T>(
  token: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> => {
  const response = await fetch(path.startsWith("https://") ? path : `${API_URL}${path}`, {
    method,
    headers: {
      "accept": "application/vnd.github+json",
      "authorization": `Bearer ${token}`,
      "user-agent": "andesine-github-sync",
      "x-github-api-version": "2022-11-28",
      ...(body !== undefined && { "content-type": "application/json" })
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

  if (!response.ok) {
    const error = (await response.json().catch(() => ({}))) as { message?: string };

    throw new GitHubError(response.status, error.message ?? response.statusText);
  }

  return (response.status === 204 ? undefined : await response.json()) as T;
};
/** Installation tokens last an hour; they are cached until 5 minutes before they expire. */
const getInstallationToken = async (env: Env, installationID: number): Promise<string> => {
  const key = String(installationID);
  const cached = tokens.get(key);

  if (cached && cached.expiresAt > Date.now() + 300_000) return cached.token;

  const issued = await request<{ token: string; expires_at: string }>(
    await createAppJWT(env),
    "POST",
    `/app/installations/${installationID}/access_tokens`
  );

  tokens.set(key, { token: issued.token, expiresAt: Date.parse(issued.expires_at) });

  return issued.token;
};
const getInstallationAccount = async (env: Env, installationID: number): Promise<string> => {
  const installation = await request<{ account: { login: string } }>(
    await createAppJWT(env),
    "GET",
    `/app/installations/${installationID}`
  );

  return installation.account.login;
};
const listRepositories = async (token: string): Promise<Repository[]> => {
  const repositories: Repository[] = [];

  for (let page = 1; page <= 10; page += 1) {
    const result = await request<{
      repositories: Array<{
        id: number;
        name: string;
        private: boolean;
        default_branch: string;
        owner: { login: string };
      }>;
    }>(token, "GET", `/installation/repositories?per_page=100&page=${page}`);

    repositories.push(
      ...result.repositories.map((repository) => ({
        id: repository.id,
        owner: repository.owner.login,
        name: repository.name,
        defaultBranch: repository.default_branch,
        private: repository.private
      }))
    );

    if (result.repositories.length < 100) break;
  }

  return repositories;
};
/** Whether a repository is private now; it can change on GitHub after a mapping is saved. */
const isPrivateRepository = async (token: string, repository: RepositoryRef): Promise<boolean> => {
  const result = await request<{ private: boolean }>(
    token,
    "GET",
    `/repos/${repository.owner}/${repository.name}`
  );

  return result.private;
};
const listBranches = async (token: string, repository: RepositoryRef): Promise<string[]> => {
  const branches = await request<Array<{ name: string }>>(
    token,
    "GET",
    `/repos/${repository.owner}/${repository.name}/branches?per_page=100`
  );

  return branches.map(({ name }) => name);
};
const getBranchHead = async (
  token: string,
  repository: RepositoryRef,
  branch: string
): Promise<BranchHead> => {
  const result = await request<{ commit: { sha: string; commit: { tree: { sha: string } } } }>(
    token,
    "GET",
    `/repos/${repository.owner}/${repository.name}/branches/${encodeURIComponent(branch)}`
  );

  return { commit: result.commit.sha, tree: result.commit.commit.tree.sha };
};
/** Changed files between two commits, or null when GitHub truncates the list. */
const compareCommits = async (
  token: string,
  repository: RepositoryRef,
  base: string,
  head: string
): Promise<Comparison | null> => {
  const result = await request<{
    files?: Array<{ filename: string; status: string; previous_filename?: string }>;
    commits: Array<{ commit: { message: string } }>;
  }>(
    token,
    "GET",
    `/repos/${repository.owner}/${repository.name}/compare/${base}...${head}?per_page=100`
  );
  const files = result.files ?? [];

  if (files.length >= COMPARE_FILE_LIMIT) return null;

  return {
    files: files.map((file) => ({
      path: file.filename,
      status: STATUSES[file.status] ?? "modified",
      ...(file.previous_filename && { previousPath: file.previous_filename })
    })),
    messages: result.commits.map(({ commit }) => commit.message)
  };
};
const listTree = async (
  token: string,
  repository: RepositoryRef,
  sha: string
): Promise<TreeFile[]> => {
  const result = await request<{ tree: Array<{ path: string; sha: string; type: string }> }>(
    token,
    "GET",
    `/repos/${repository.owner}/${repository.name}/git/trees/${sha}?recursive=1`
  );

  return result.tree
    .filter(({ type }) => type === "blob")
    .map(({ path, sha: blob }) => ({ path, sha: blob }));
};
/** The files of a commit that a mapping syncs, by mapped directory-relative path. */
const listMappedFiles = async (
  token: string,
  mapping: Mapping,
  commit: string
): Promise<string[]> => {
  return (await listTree(token, mapping.repository, commit))
    .map(({ path }) => getMappedPath(path, mapping))
    .filter((path): path is string => path !== null);
};
const readBlob = async (
  token: string,
  repository: RepositoryRef,
  sha: string
): Promise<Uint8Array> => {
  const blob = await request<{ content: string }>(
    token,
    "GET",
    `/repos/${repository.owner}/${repository.name}/git/blobs/${sha}`
  );

  return fromBase64(blob.content);
};
/** A file's bytes at a commit, or null when it doesn't exist there. */
const readFile = async (
  token: string,
  repository: RepositoryRef,
  path: string,
  ref: string
): Promise<Uint8Array | null> => {
  try {
    const file = await request<{ sha: string; content?: string; encoding?: string }>(
      token,
      "GET",
      `/repos/${repository.owner}/${repository.name}/contents/${path.split("/").map(encodeURIComponent).join("/")}?ref=${ref}`
    );

    // Files over 1 MB come without their content, which the blob then has.
    return file.encoding === "base64" && file.content
      ? fromBase64(file.content)
      : await readBlob(token, repository, file.sha);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;

    throw error;
  }
};
const readTextFile = async (
  token: string,
  repository: RepositoryRef,
  path: string,
  ref: string
): Promise<string | null> => {
  const bytes = await readFile(token, repository, path, ref);

  return bytes && new TextDecoder().decode(bytes);
};
/**
 * Commits the changes on top of the branch head in one commit; retries when the branch moved.
 * @returns The new commit, or null when the changes don't change the tree.
 */
const commitChanges = async (
  token: string,
  repository: RepositoryRef,
  branch: string,
  changes: CommitChange[],
  message: string
): Promise<CommitResult | null> => {
  const base = `/repos/${repository.owner}/${repository.name}/git`;

  // Blobs don't depend on the head, so retries reuse them.
  const entries = await Promise.all(
    changes.map(async ({ path, content }) => {
      if (content === null) return { path, mode: "100644", type: "blob", sha: null };
      if (typeof content === "string") return { path, mode: "100644", type: "blob", content };

      const blob = await request<{ sha: string }>(token, "POST", `${base}/blobs`, {
        content: toBase64(content),
        encoding: "base64"
      });

      return { path, mode: "100644", type: "blob", sha: blob.sha };
    })
  );

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const head = await getBranchHead(token, repository, branch);
    const tree = await request<{ sha: string }>(token, "POST", `${base}/trees`, {
      base_tree: head.tree,
      tree: entries
    });

    if (tree.sha === head.tree) return null;

    const commit = await request<{ sha: string }>(token, "POST", `${base}/commits`, {
      message,
      tree: tree.sha,
      parents: [head.commit]
    });

    try {
      await request(token, "PATCH", `${base}/refs/heads/${branch}`, {
        sha: commit.sha,
        force: false
      });

      return { sha: commit.sha, parent: head.commit };
    } catch (error) {
      const isStale = error instanceof GitHubError && error.status === 422;

      if (!isStale) throw error;
    }
  }

  throw new Error("The branch kept changing; the export will run again");
};
/** The user's token from the install callback's code, to check who installed the App. */
const exchangeCode = async (env: Env, code: string): Promise<string> => {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "accept": "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code
    })
  });
  const result = (await response.json()) as { access_token?: string; error_description?: string };

  if (!result.access_token) {
    throw new GitHubError(401, result.error_description ?? "No access token");
  }

  return result.access_token;
};
const hasUserInstallation = async (userToken: string, installationID: number): Promise<boolean> => {
  for (let page = 1; page <= 10; page += 1) {
    const result = await request<{ installations: Array<{ id: number }> }>(
      userToken,
      "GET",
      `/user/installations?per_page=100&page=${page}`
    );

    if (result.installations.some(({ id }) => id === installationID)) return true;
    if (result.installations.length < 100) return false;
  }

  return false;
};
const verifyWebhook = async (env: Env, body: string, header: string | null): Promise<boolean> => {
  const hex = header?.startsWith("sha256=") ? header.slice(7) : "";
  const bytes = Uint8Array.from(hex.match(/../g) ?? [], (pair) => parseInt(pair, 16));

  return verify(env.GITHUB_WEBHOOK_SECRET, body, toBase64URL(bytes));
};

export {
  GitHubError,
  getInstallationToken,
  getInstallationAccount,
  listRepositories,
  isPrivateRepository,
  listBranches,
  getBranchHead,
  compareCommits,
  listMappedFiles,
  readFile,
  readTextFile,
  commitChanges,
  exchangeCode,
  hasUserInstallation,
  verifyWebhook
};
export type { Repository, RepositoryRef, CommitChange, CommitResult };
