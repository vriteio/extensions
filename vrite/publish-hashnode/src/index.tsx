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
  accessToken: string;
  contentGroupId: string;
  autoPublish: boolean;
  requireCanonicalLink: boolean;
  publicationId: string;
};
type ContentPieceData = {
  hashnodeId?: string;
  autoPublish?: boolean;
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
      config?.autoPublish &&
      config?.contentGroupId &&
      config?.publicationId &&
      config.accessToken;

    if (webhooks.length > 0) {
      if (configComplete) {
        await client.webhooks.update({
          id: webhooks[0].id,
          url: "https://extensions.vrite.io/hashnode/webhook",
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
        url: "https://extensions.vrite.io/hashnode/webhook",
      });
    }
  }),
  configurationView: createView<ExtensionConfigurationViewContext<Config>>(
    ({ use }) => {
      const [accessToken] = use("config.accessToken");
      const [publicationId] = use("config.publicationId");
      const [autoPublish, setAutoPublish] = use("config.autoPublish");
      const [contentGroupId, setContentGroupId] = use("config.contentGroupId");
      const [requireCanonicalLink] = use("config.requireCanonicalLink");

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
            label="Access Token"
            bind:value={accessToken}
            placeholder="Access Token"
          >
            Your Hashnode API Access Token. You can generate one in the
            [Developer Settings](https://hashnode.com/settings/developer), of
            your Hashnode account.
          </Components.Field>
          <Components.Field
            type="text"
            label="Publication ID"
            bind:value={publicationId}
            placeholder="Publication ID"
          >
            ID of the Hashnode publication/blog you are in and want to publish
            your posts to. You can find the publication ID in the URL (in form
            of **hashnode.com/[id]/dashboard**) when visiting your publication's
            dashboard.
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
        </>
      );
    }
  ),
  contentPieceView: createView<
    ExtensionContentPieceViewContext<Config, ContentPieceData>
  >(({ config, token, extensionId, notify, use, flush }) => {
    const contentPiece = use("contentPiece");
    const [hashnodeId, setHashnodeId] = use("data.hashnodeId");
    const [autoPublish, setAutoPublish] = use("data.autoPublish");
    const disabled =
      !config?.accessToken ||
      !config.publicationId ||
      (config.autoPublish && !config.contentGroupId);
    const [loading, setLoading] = createTemp<boolean>(false);
    const [buttonLabel, setButtonLabel] = createTemp(
      hashnodeId() ? "Update" : "Publish"
    );
    const publish = createFunction(async () => {
      try {
        setLoading(true);
        await flush();

        const response = await fetch("https://extensions.vrite.io/hashnode", {
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

        if (!response.ok || !data.hashnodeId) {
          throw new Error("Couldn't publish to Hashnode");
        }

        if (hashnodeId()) {
          notify({ text: "Updated on Hashnode", type: "success" });
        } else {
          notify({ text: "Published to Hashnode", type: "success" });
        }

        if (data.hashnodeId && data.hashnodeId !== hashnodeId()) {
          setHashnodeId(data.hashnodeId);
        }

        setLoading(false);
        setButtonLabel("Update");
        await flush();
      } catch (error) {
        notify({ text: "Couldn't publish to Hashnode", type: "error" });
        setLoading(false);
        await flush();
      }
    });

    if (typeof autoPublish() !== "boolean") {
      setAutoPublish(true);
    }

    return (
      <Components.View class="flex flex-col gap-2">
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
          class="w-full justify-center items-center m-0"
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
