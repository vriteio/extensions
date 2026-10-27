import clsx from "clsx";
import {
  BlockArea,
  Box,
  Button,
  ContentSlot,
  Icon,
  Text,
  type ElementTemplateProps
} from "@andesine/extensions/solid";
import { CARD_CLASS, CONTENT_CLASS } from "./classes";
import { createEffect, createSignal, on, Show } from "solid-js";

interface AccordionProps {
  title?: string;
  open?: boolean;
}

/**
 * `<Accordion title open>`, as the site shows it: the title opens and closes the content. It
 * starts as `open` sets it; toggling it only changes the view, not the document. The header
 * drags the accordion; its blocks have the editor's drag handle, block menu, and selection.
 */
export const AccordionView = (props: ElementTemplateProps<AccordionProps>) => {
  const [open, setOpen] = createSignal(props.props.open ?? false);

  createEffect(
    on(
      () => props.props.open,
      (value) => setOpen(value ?? false),
      { defer: true }
    )
  );

  return (
    <Box padding="none" class={clsx(CARD_CLASS, "my-2 overflow-clip")}>
      <BlockArea block={props.key} draggable selectable onActivate={() => setOpen(!open())}>
        <Button
          variant="ghost"
          class={clsx(
            "flex min-h-9 w-full items-center justify-between gap-2 rounded-none px-4 py-1.5 hover:bg-gray-100 focus-visible:bg-gray-100 active:cursor-grabbing",
            open() && "bg-gray-100"
          )}
          onClick={() => setOpen(!open())}
        >
          <Text size="base" weight="semibold" class="text-start leading-7 text-gray-900">
            {props.props.title || "Details"}
          </Text>
          <Icon
            name="i-lucide:chevron-right"
            class={clsx(
              "h-4.5! w-4.5! text-gray-400 transition-transform duration-200",
              open() && "rotate-90"
            )}
          />
        </Button>
      </BlockArea>
      <Show when={open()}>
        <Box padding="none" class="rounded-none border-t border-gray-200">
          {/* The padding is the slot's, so it counts as content for the drag handle. */}
          <ContentSlot
            controls
            class="px-4 py-3"
            placeholder="Write what the title reveals"
            contentClass={CONTENT_CLASS}
          />
        </Box>
      </Show>
    </Box>
  );
};
