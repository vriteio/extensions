import { getBackend } from "../andesine";
import type { Env } from "../env";
import {
  exchangeCode,
  getInstallationAccount,
  hasUserInstallation,
  verifyWebhook
} from "../github";
import { enqueueJob } from "../repository-sync";
import { readToken } from "../signing";
import {
  createStore,
  linkInstallation,
  listInstallationLinks,
  unlinkInstallation,
  type InstallationLink
} from "../store";

interface PushEvent {
  ref: string;
  after: string;
  deleted?: boolean;
  repository: { id: number };
  installation?: { id: number };
}
interface InstallationEvent {
  action: string;
  installation: { id: number };
}

const page = (message: string, status = 200): Response => {
  const html = `<!doctype html><meta charset="utf-8"><title>GitHub Sync</title><body style="font-family:system-ui;padding:2rem"><p>${message}</p></body>`;

  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
};
/**
 * GitHub sends the person here after they install the App. The signed state names the Andesine
 * installation; the code proves that this person can access the GitHub installation, so a state
 * can't link someone else's installation.
 */
const handleSetup = async (env: Env, request: Request): Promise<Response> => {
  const url = new URL(request.url);
  const installationID = Number(url.searchParams.get("installation_id"));
  const code = url.searchParams.get("code");
  const link = await readToken<InstallationLink>(
    env.STATE_SECRET,
    url.searchParams.get("state") ?? ""
  );

  if (!link || !installationID || !code) {
    return page("The link has expired. Connect GitHub again from Andesine.", 400);
  }

  const userToken = await exchangeCode(env, code);

  if (!(await hasUserInstallation(userToken, installationID))) {
    return page("Your GitHub account can't access this installation.", 403);
  }

  const client = getBackend(env).createClient(link.instance, link.extensionID);
  const store = createStore(env, client, link.extensionID);

  await unlinkInstallation(env, link);
  await store.setConnection({
    installationID,
    account: await getInstallationAccount(env, installationID)
  });
  await linkInstallation(env, installationID, link);

  return page("GitHub is connected. You can close this tab and go back to Andesine.");
};
const handleWebhook = async (env: Env, request: Request): Promise<Response> => {
  const body = await request.text();

  if (!(await verifyWebhook(env, body, request.headers.get("x-hub-signature-256")))) {
    return new Response(null, { status: 401 });
  }

  const event = request.headers.get("x-github-event");
  const delivery = request.headers.get("x-github-delivery") ?? crypto.randomUUID();

  if (event === "push") {
    const push = JSON.parse(body) as PushEvent;
    const isBranch = push.ref.startsWith("refs/heads/");

    if (isBranch && !push.deleted && push.installation) {
      await enqueueJob(env, push.repository.id, {
        kind: "push",
        id: `push:${delivery}`,
        installationID: push.installation.id,
        repositoryID: push.repository.id,
        branch: push.ref.slice("refs/heads/".length),
        commit: push.after
      });
    }
  } else if (event === "installation") {
    const installation = JSON.parse(body) as InstallationEvent;

    if (installation.action === "deleted") {
      for (const link of await listInstallationLinks(env, installation.installation.id)) {
        const client = getBackend(env).createClient(link.instance, link.extensionID);

        await createStore(env, client, link.extensionID)
          .deleteConnection()
          .catch(() => undefined);
        await unlinkInstallation(env, link);
      }
    }
  }

  return new Response(null, { status: 202 });
};

export { handleSetup, handleWebhook };
