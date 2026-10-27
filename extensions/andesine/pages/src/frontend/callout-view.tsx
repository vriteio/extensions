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
import { CARD_CLASS, CONTENT_CLASS, DRAG_CLASS } from "./classes";
import { Show } from "solid-js";

interface CalloutProps {
  type?: "note" | "tip" | "warning" | "danger";
  title?: string;
}

// The template's icons and colours by type.
const ICONS = {
  note: { name: "i-lucide:info", class: "text-gray-500" },
  tip: { name: "i-lucide:lightbulb", class: "bg-gradient-to-tr" },
  warning: { name: "i-lucide:triangle-alert", class: "text-amber-500" },
  danger: { name: "i-lucide:octagon-alert", class: "text-red-500" }
};

/** `<Callout type title>`, as the site shows it. */
export const CalloutView = (props: ElementTemplateProps<CalloutProps>) => {
  const icon = () => ICONS[props.props.type ?? "note"] ?? ICONS.note;

  return (
    <Box padding="none" class={clsx(CARD_CLASS, "my-2 flex gap-3 px-4 py-3")}>
      {/* The left strip, with the icon, and the title drag the callout. */}
      <BlockArea block={props.key} draggable selectable>
        <Box
          padding="none"
          class={clsx("-my-3 -ml-4 -mr-3 self-stretch py-3 pl-4 pr-3", DRAG_CLASS)}
        >
          <Icon name={icon().name} class={clsx("mt-1 h-5 w-5", icon().class)} />
        </Box>
      </BlockArea>
      <Stack gap="none" class="min-w-0 flex-1">
        <Show when={props.props.title}>
          {(title) => (
            <BlockArea block={props.key} draggable selectable>
              <Text
                size="base"
                weight="semibold"
                class={clsx("leading-7 text-gray-900", DRAG_CLASS)}
              >
                {title()}
              </Text>
            </BlockArea>
          )}
        </Show>
        <ContentSlot placeholder="Write the callout" contentClass={CONTENT_CLASS} />
      </Stack>
    </Box>
  );
};
