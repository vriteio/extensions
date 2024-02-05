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
  apiKey: string;
  organizationId: string;
  autoPublish: boolean;
  contentGroupId: string;
  requireCanonicalLink: boolean;
  draft: boolean;
};
type ContentPieceData = {
  devId?: string;
  devSeries?: string;
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
      config?.autoPublish && config?.contentGroupId && config?.apiKey;

    if (webhooks.length > 0) {
      if (configComplete) {
        await client.webhooks.update({
          id: webhooks[0].id,
          url: "https://extensions.vrite.io/dev/webhook",
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
        url: "https://extensions.vrite.io/dev/webhook",
      });
    }
  }),
  configurationView: createView<ExtensionConfigurationViewContext<Config>>(
    ({ use }) => {
      const [apiKey] = use("config.apiKey");
      const [organizationId] = use("config.organizationId");
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
            color="contrast"
            label="API key"
            placeholder="API key"
            bind:value={apiKey}
          >
            Your Dev.to API key. You can generate one in the [settings
            page](https://dev.to/settings/extensions), under **DEV Community API
            Keys** section
          </Components.Field>
          <Components.Field
            type="text"
            color="contrast"
            label="Organization ID"
            optional
            bind:value={organizationId}
          >
            ID of the Dev.to organization you are in and want to publish your
            posts to. You can find the organization ID in the URL of the your
            [Dev.to Dashboard](https://dev.to/dashboard), when **filtering posts
            by organization**
          </Components.Field>
          <Components.Show bind:when={autoPublish}>
            <Components.Field
              type="text"
              color="contrast"
              label="Content group"
              bind:value={contentGroupId}
            >
              Provide ID of a content group to auto-publish from, when content
              pieces are moved to it. You can copy the ID from the dashboard.
            </Components.Field>
            <Components.Field
              type="checkbox"
              color="contrast"
              label="Require canonical link"
              bind:value={requireCanonicalLink}
            >
              Don't auto-publish when no canonical link is set
            </Components.Field>
          </Components.Show>
          <Components.Field
            type="checkbox"
            color="contrast"
            label="Auto-publish"
            bind:value={autoPublish}
          >
            Publish posts automatically
          </Components.Field>
          <Components.Field
            type="checkbox"
            color="contrast"
            label="Draft"
            bind:value={draft}
          >
            whether the Dev.to article should be in draft (private) by default
          </Components.Field>
        </>
      );
    }
  ),
  contentPieceView: createView<
    ExtensionContentPieceViewContext<Config, ContentPieceData>
  >(({ config, token, extensionId, notify, use, flush }) => {
    const disabled =
      !config?.apiKey || (config.autoPublish && !config.contentGroupId);
    const contentPiece = use("contentPiece");
    const [devId, setDevId] = use("data.devId");
    const [devSeries] = use("data.devSeries");
    const [autoPublish, setAutoPublish] = use("data.autoPublish");
    const [draft, setDraft] = use("data.draft");
    const [loading, setLoading] = createTemp<boolean>(false);
    const [buttonLabel, setButtonLabel] = createTemp(
      devId() ? "Update" : "Publish"
    );
    const publish = createFunction(async () => {
      try {
        setLoading(true);
        await flush();

        const response = await fetch("https://extensions.vrite.io/dev", {
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

        if (!response.ok || !data.devId) {
          throw new Error("Couldn't publish to Dev.to");
        }

        if (devId()) {
          notify({ text: "Updated on Dev.to", type: "success" });
        } else {
          notify({ text: "Published to Dev.to", type: "success" });
        }

        if (data.devId && data.devId !== devId()) {
          setDevId(data.devId);
        }

        setLoading(false);
        setButtonLabel("Update");
        await flush();
      } catch (error) {
        notify({ text: "Couldn't publish to Dev.to", type: "error" });
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
          type="text"
          color="contrast"
          label="Series name"
          placeholder="Series name"
          bind:value={devSeries}
          disabled={disabled}
        >
          The exact name of the series to which this post should be added
        </Components.Field>
        <Components.Field
          type="checkbox"
          color="contrast"
          label="Draft"
          bind:value={draft}
          disabled={disabled}
        >
          whether the Dev.to article should be in draft (private)
        </Components.Field>
        <Components.Show when={config?.autoPublish}>
          <Components.Field
            type="checkbox"
            color="contrast"
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
