/** @jsx createElement */
/** @jsxFrag createFragment */
import {
  Components,
  createView,
  createTemp,
  createFunction,
  createRuntime,
  ExtensionConfigurationViewContext,
  ExtensionContentPieceViewContext,
  createElement,
  createFragment,
} from "@vrite/sdk/extensions";

type Config = {
  token: string;
  contentGroupId: string;
  autoPublish: boolean;
  draft: boolean;
  requireCanonicalLink: boolean;
};
type ContentPieceData = {
  mediumId?: string;
  autoPublish?: boolean;
  draft?: boolean;
};
export default createRuntime<Config>({
  onUninstall: createFunction(async ({ client }) => {
    const webhooks = await client.webhooks.list({ extensionOnly: true });

    if (webhooks.length > 0) {
      client.webhooks.delete({
        id: webhooks[0].id,
      });
    }
  }),
  onConfigure: createFunction(async ({ client, config, spec }) => {
    const webhooks = await client.webhooks.list({ extensionOnly: true });
    const configComplete =
      config?.autoPublish && config?.contentGroupId && config?.token;

    if (webhooks.length > 0) {
      if (configComplete) {
        await client.webhooks.update({
          id: webhooks[0].id,
          url: "https://extensions.vrite.io/medium/webhook",
          metadata: {
            contentGroupId: `${config.contentGroupId}`,
          },
        });
      } else {
        await client.webhooks.delete({
          id: webhooks[0].id,
        });
      }
    } else if (configComplete) {
      await client.webhooks.create({
        name: spec.displayName,
        event: "contentPieceAdded",
        metadata: {
          contentGroupId: `${config.contentGroupId}`,
        },
        url: "https://extensions.vrite.io/medium/webhook",
      });
    }
  }),
  configurationView: createView<ExtensionConfigurationViewContext<Config>>(
    ({ use }) => {
      const [token] = use("config.token");
      const [autoPublish, setAutoPublish] = use("config.autoPublish");
      const [contentGroupId, setContentGroupId] = use("config.contentGroupId");
      const [requireCanonicalLink] = use("config.requireCanonicalLink");
      const [draft] = use("config.draft");

      if (typeof autoPublish() !== "boolean") {
        setAutoPublish(true);
      }

      if (!contentGroupId()) {
        setContentGroupId("");
      }

      return (
        <>
          <Components.Field
            type="text"
            label="Integration token"
            placeholder="Integration token"
            bind:value={token}
          >
            Your Medium Integration token. You can generate one in the
            [**Security and apps**
            section](https://medium.com/me/settings/security) of your account
            settings page
          </Components.Field>

          <Components.Show bind:when={autoPublish}>
            <Components.Field
              type="text"
              label="Content group ID"
              bind:value={contentGroupId}
            >
              Provide ID of a content group to auto-publish from, when content
              pieces are moved to it. You can copy the ID from the dashboard.
            </Components.Field>
            <Components.Field
              type="checkbox"
              label="Require canonical link"
              bind:value={requireCanonicalLink}
            >
              Don't auto-publish when no canonical link is set
            </Components.Field>
          </Components.Show>

          <Components.Field
            type="checkbox"
            label="Auto-publish"
            bind:value={autoPublish}
          >
            Publish posts automatically
          </Components.Field>
          <Components.Field type="checkbox" label="Draft" bind:value={draft}>
            whether the article should have the draft status by default
          </Components.Field>
        </>
      );
    }
  ),
  contentPieceView: createView<
    ExtensionContentPieceViewContext<Config, ContentPieceData>
  >(({ config, token, extensionId, notify, use, flush }) => {
    const disabled =
      !config?.token || (config.autoPublish && !config.contentGroupId);
    const contentPiece = use("contentPiece");
    const [mediumId, setMediumId] = use("data.mediumId");
    const [autoPublish, setAutoPublish] = use("data.autoPublish");
    const [draft, setDraft] = use("data.draft");
    const [loading, setLoading] = createTemp<boolean>(false);

    const [buttonLabel, setButtonLabel] = createTemp(
      mediumId() ? "Republish" : "Publish"
    );
    const publish = createFunction(async () => {
      try {
        setLoading(true);
        await flush();

        const response = await fetch("https://extensions.vrite.io/medium", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Vrite-Extension-Id": extensionId,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contentPieceId: contentPiece().id,
          }),
        });
        const data = await response.json();

        if (!response.ok || !data.mediumId) {
          throw new Error("Couldn't publish to Medium");
        }

        if (mediumId()) {
          notify({ text: "Republished to Medium", type: "success" });
        } else {
          notify({ text: "Published to Medium", type: "success" });
        }

        if (data.mediumId && data.mediumId !== mediumId()) {
          setMediumId(data.mediumId);
        }

        setLoading(false);
        setButtonLabel("Republish");
        await flush();
      } catch (error) {
        notify({ text: "Couldn't publish to Medium", type: "error" });
        setLoading(false);
        await flush();
      }
    });

    if (typeof draft() !== "boolean") {
      setDraft(config?.draft || false);
    }

    if (typeof autoPublish() !== "boolean") {
      setAutoPublish(true);
    }

    return (
      <Components.View class="flex flex-col gap-2">
        <Components.Field
          type="checkbox"
          label="Draft"
          bind:value={draft}
          disabled={disabled}
        >
          whether the article should have the draft status by default
        </Components.Field>
        <Components.Show when={config?.autoPublish}>
          <Components.Field
            type="checkbox"
            label="Auto-publish"
            bind:value={autoPublish}
            disabled={disabled}
          >
            whether the article should be auto-published
          </Components.Field>
        </Components.Show>
        <Components.Button
          color="primary"
          class="w-full flex justify-center items-center m-0"
          disabled={disabled}
          bind:loading={loading}
          on:click={publish}
        >
          <Components.Text bind:content={buttonLabel} />
        </Components.Button>
      </Components.View>
    );
  }),
});
