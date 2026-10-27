const PRIVATE_REPOSITORY_MESSAGE = "Private repositories need the Pro plan";

/** A sync that the workspace's plan doesn't allow; it fails at once, without retries. */
class PlanRequiredError extends Error {}

/** Free workspaces sync public repositories; private ones need a paid plan. */
const canSyncPrivateRepositories = (plan: string): boolean => plan !== "free";

export { PRIVATE_REPOSITORY_MESSAGE, PlanRequiredError, canSyncPrivateRepositories };
