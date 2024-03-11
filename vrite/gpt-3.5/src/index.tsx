/** @jsx createElement */
/** @jsxFrag createFragment */
import {
  Components,
  createView,
  createTemp,
  createFunction,
  createRuntime,
  createElement,
  ExtensionBlockActionViewContext,
} from "@vrite/sdk/extensions";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import {
  gfmInputTransformer,
  gfmOutputTransformer,
} from "@vrite/sdk/transformers";

declare global {
  interface Window {
    currentRequestController?: AbortController;
  }
}

type Config = {};

const stopIcon =
  "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z";

const x = createRuntime({
  blockActions: [
    {
      id: "generate",
      blocks: ["paragraph"],
      label: "Generate with GPT",
      view: createView<ExtensionBlockActionViewContext<Config>>((ctx) => {
        const [prompt] = createTemp<string>("");
        const [includeContext] = createTemp<boolean>(false);
        const [loading, setLoading] = createTemp<boolean>(false);
        const content = ctx.use("content");
        const generate = createFunction(async () => {
          let textContent = "";
          let processedPrompt = prompt();

          if (includeContext()) {
            processedPrompt = `"${gfmOutputTransformer(
              content()
            )}"\n\n${prompt()}`;
          }

          setLoading(true);
          await ctx.flush();
          window.currentRequestController = new AbortController();
          window.currentRequestController.signal.addEventListener(
            "abort",
            () => {
              setLoading(false);
              ctx.flush();
            }
          );
          await fetchEventSource("https://extensions.vrite.io/gpt", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
            },
            body: JSON.stringify({
              prompt: processedPrompt,
            }),
            signal: window.currentRequestController?.signal,
            async onopen() {
              return;
            },
            onerror(error) {
              setLoading(false);
              ctx.flush();
              ctx.notify({
                text: "Error while generating content",
                type: "error",
              });
              throw error;
            },
            onmessage(event) {
              const partOfContent = decodeURIComponent(event.data);

              textContent += partOfContent;
              ctx.replaceContent(gfmInputTransformer(textContent).content);
            },
            onclose() {
              setLoading(false);
              ctx.flush();
              ctx.refreshContent();
            },
          });
        });
        const stop = createFunction(() => {
          window.currentRequestController?.abort();
          setLoading(false);
          ctx.flush();
        });

        return (
          <Components.View class="max-w-sm flex flex-col gap-3">
            <Components.Field
              type="text"
              color="contrast"
              label="Prompt"
              textarea={true}
              bind:value={prompt}
            />
            <Components.Field
              type="checkbox"
              label="Include context"
              bind:value={includeContext}
            >
              Quote paragraph in the beginning of the prompt for additional
              context
            </Components.Field>
            <Components.View class="flex w-full gap-1">
              <Components.Button
                color="primary"
                class="m-0 flex-1"
                bind:loading={loading}
                on:click={generate}
              >
                Generate
              </Components.Button>
              <Components.Show bind:when={loading}>
                <Components.Tooltip text="Stop" class="mt-1" fixed={true}>
                  <Components.IconButton
                    text="soft"
                    class="m-0"
                    path={stopIcon}
                    on:click={stop}
                  />
                </Components.Tooltip>
              </Components.Show>
            </Components.View>
          </Components.View>
        );
      }),
    },
  ],
});

export default x;
