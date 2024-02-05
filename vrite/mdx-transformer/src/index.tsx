import {
  createFunction,
  createRuntime,
  ExtensionBaseContext,
} from "@vrite/sdk/extensions";

declare global {
  interface Window {
    currentRequestController?: AbortController;
  }
}

type Config = {};

export default createRuntime({
  onConfigure: createFunction<ExtensionBaseContext<Config>>(async (ctx) => {
    const transformers = await ctx.client.transformers.list();
    const mdxTransformer = transformers.find((transformer) => {
      return (
        transformer.label === "MDX" &&
        transformer.input === "https://extensions.vrite.io/mdx/input" &&
        transformer.output === "https://extensions.vrite.io/mdx/output"
      );
    });

    if (!mdxTransformer) {
      await ctx.client.transformers.create({
        input: "https://extensions.vrite.io/mdx/input",
        output: "https://extensions.vrite.io/mdx/output",
        maxBatchSize: 100,
        label: "MDX",
      });
    }
  }),
  onUninstall: createFunction<ExtensionBaseContext<Config>>(async (ctx) => {
    const transformers = await ctx.client.transformers.list();

    if (transformers.length > 0) {
      const mdxTransformer = transformers.find((transformer) => {
        return (
          transformer.label === "MDX" &&
          transformer.input === "https://extensions.vrite.io/mdx/input" &&
          transformer.output === "https://extensions.vrite.io/mdx/output"
        );
      });

      if (mdxTransformer) {
        await ctx.client.transformers.delete({
          id: mdxTransformer?.id,
        });
      }
    }
  }),
});
