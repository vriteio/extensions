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
      type: "Contract",
      view: createView<ExtensionElementViewContext<Config>>(({ content }) => {
        return (
          <Components.Card class="flex flex-col items-center justify-start p-3 m-0 my-4">
            {content}
          </Components.Card>
        );
      }),
    },
    {
      type: "Title",
      view: createView<ExtensionElementViewContext<Config>>(({ content }) => {
        return (
          <Components.View class="flex -my-4">
            <Components.View class="text-gray-500 dark:text-gray-400 mr-1">
              Title:
            </Components.View>
            {content}
          </Components.View>
        );
      }),
    },
  ],
});
