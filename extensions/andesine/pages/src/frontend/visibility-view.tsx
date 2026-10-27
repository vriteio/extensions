import clsx from "clsx";
import {
  BlockArea,
  Box,
  ContentSlot,
  Icon,
  Stack,
  Text,
  type ElementTemplateProps
} from "@andesine/extensions/solid";
import { CONTENT_CLASS, DRAG_CLASS } from "./classes";

interface VisibilityProps {
  for?: "agents" | "humans";
}

const AUDIENCES = {
  humans: { icon: "i-lucide:eye", label: "Web page only" },
  agents: { icon: "i-lucide:bot", label: "Agents only" }
};
// As the editor's fragments: a gray line to the end of the header, and one below the content.
const LINE_CLASS = "h-px rounded-full bg-gray-200";

/**
 * `<Visibility for>`: content only on the web page, or only in the Markdown for agents. As on the
 * site, the content isn't indented; a header and a line below mark it. Both drag the element, open
 * its menu, which switches the audience, and select it.
 */
export const VisibilityView = (props: ElementTemplateProps<VisibilityProps>) => {
  const audience = () => AUDIENCES[props.props.for ?? "humans"];

  return (
    <Stack gap="none" class={clsx("my-2", props.dragged && "opacity-50")}>
      <BlockArea block={props.key} draggable menu selectable>
        <Stack direction="row" gap="small" align="center" class={clsx("h-9", DRAG_CLASS)}>
          <Icon name={audience().icon} class="h-4.5 w-4.5 shrink-0 text-gray-300" />
          <Text size="sm" weight="medium" class="mr-1 shrink-0 text-gray-500">
            {audience().label}
          </Text>
          <Box padding="none" class={clsx(LINE_CLASS, "flex-1")} />
        </Stack>
      </BlockArea>
      <ContentSlot controls placeholder="Write the content" contentClass={CONTENT_CLASS} />
      <BlockArea block={props.key} draggable menu selectable>
        <Box padding="none" class={clsx("py-2", DRAG_CLASS)}>
          <Box padding="none" class={LINE_CLASS} />
        </Box>
      </BlockArea>
    </Stack>
  );
};
