/** @jsx createElement */
/** @jsxFrag createFragment */
import {
  ExtensionElementViewContext,
  Components,
  createView,
  createRuntime,
  createElement,
} from "@vrite/sdk/extensions";

declare global {
  interface Window {
    currentRequestController?: AbortController;
  }
}

type Config = {};

const alertIcon =
  "M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z";

export default createRuntime({
  elements: [
    {
      type: "Issue",
      view: createView<
        ExtensionElementViewContext<
          Config,
          { severity: "informational" | "low" | "medium" | "high" | "critical" }
        >
      >(({ use, css }) => {
        const [severity, setSeverity] = use("props.severity");

        /*if (!severity()) {
          setSeverity("informational");
        }*/

        return (
          <Components.View
            class={css`flex flex-col items-center justify-start m-0 my-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700`}
          >
            <Components.Content>
              <Components.Element type="Title">
                <Components.View
                  class={css`flex items-start border-b-2 border-gray-200 dark:border-gray-700 bg-gray-50 rounded-t-2xl`}
                >
                  <Components.View
                    class={css`mr-1 text-gray-500 dark:text-gray-400 font-bold text-base h-[35px] font-mono min-w-40 px-2 inline-flex items-center`}
                  >
                    Issue
                  </Components.View>
                  <Components.Content content="paragraph" />
                </Components.View>
              </Components.Element>
              <Components.Element type="Severity">
                <Components.View
                  class={css`flex items-start border-b-2 border-gray-200 dark:border-gray-700`}
                >
                  <Components.View
                    class={css`text-gray-500 dark:text-gray-400 mr-1 font-bold text-base h-10 font-mono min-w-40 px-2 inline-flex items-center`}
                  >
                    Severity
                  </Components.View>
                  <Components.View class={css`flex items-center`}>
                    <Components.Select
                      bind:value={severity}
                      class="mx-0"
                      options={[
                        { label: "Informational", value: "informational" },
                        { label: "Low", value: "low" },
                        { label: "Medium", value: "medium" },
                        { label: "High", value: "high" },
                        { label: "Critical", value: "critical" },
                      ]}
                    />
                  </Components.View>
                </Components.View>
              </Components.Element>
              <Components.Element type="Description">
                <Components.View
                  class={css`flex items-start border-b-2 py-2 border-gray-200 dark:border-gray-700`}
                >
                  <Components.View
                    class={css`text-gray-500 dark:text-gray-400 mr-1 font-bold text-base h-[35px] font-mono min-w-40 px-2 inline-flex items-center`}
                  >
                    Description
                  </Components.View>
                  <Components.Content content="paragraph+" />
                </Components.View>
              </Components.Element>
              <Components.Element type="Recommendation">
                <Components.View
                  class={css`flex items-start py-2 border-gray-200 dark:border-gray-700 rounded-b-2xl`}
                >
                  <Components.View
                    class={css`text-gray-500 dark:text-gray-400 mr-1 font-bold text-base h-[35px] font-mono min-w-40 px-2 inline-flex items-center`}
                  >
                    Recommendation
                  </Components.View>
                  <Components.Content content="paragraph+" />
                </Components.View>
              </Components.Element>
            </Components.Content>
          </Components.View>
        );
      }),
    },
  ],
});
