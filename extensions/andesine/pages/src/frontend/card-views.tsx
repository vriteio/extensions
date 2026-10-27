import clsx from "clsx";
import {
  BlockArea,
  Box,
  Button,
  ContentSlot,
  Icon,
  Stack,
  Text,
  useEditor,
  type ElementTemplateProps
} from "@andesine/extensions/solid";
import { CARD_CLASS, DRAG_CLASS, SHADE_CLASS } from "./classes";
import { Show } from "solid-js";

interface CardProps {
  title?: string;
  icon?: string;
  href?: string;
}

// The place a dropped card takes: a dashed outline over the card's border.
const DROP_CLASS =
  "pointer-events-none absolute -inset-px rounded-xl border border-dashed border-primary";

/**
 * `<Card title icon href>`, as the site shows it. The icon and the title drag the card and open
 * its menu; the card marks its own selection, and a drop near it takes its place.
 */
export const CardView = (props: ElementTemplateProps<CardProps>) => (
  <Box
    padding="none"
    class={clsx(
      CARD_CLASS,
      "relative flex flex-1 flex-col gap-2 p-4",
      props.dragged && "opacity-50"
    )}
  >
    <Show when={props.props.icon}>
      {(icon) => (
        <BlockArea block={props.key} draggable menu selectable marksSelection droppable>
          <Box padding="none" class={clsx("self-start", DRAG_CLASS)}>
            <Icon name={icon()} class="h-6 w-6 bg-gradient-to-tr" />
          </Box>
        </BlockArea>
      )}
    </Show>
    <BlockArea block={props.key} draggable menu selectable marksSelection droppable>
      <Stack direction="row" gap="small" align="center" class={DRAG_CLASS}>
        <Text size="base" weight="semibold" class="leading-7 text-gray-900">
          {props.props.title || "Title"}
        </Text>
        <Show when={props.props.href}>
          <Icon name="i-lucide:arrow-right" size="small" class="text-gray-400" />
        </Show>
      </Stack>
    </BlockArea>
    <Box padding="none" class="text-sm text-gray-500">
      <ContentSlot placeholder="Card text" contentClass="[&>p]:m-0" />
    </Box>
    <Show when={props.blockSelected || props.dropTarget}>
      <Box padding="none" class={clsx(SHADE_CLASS, "rounded-xl")} />
    </Show>
    <Show when={props.dropTarget}>
      <Box padding="none" class={DROP_CLASS} />
    </Show>
  </Box>
);
/** `<CardGrid>`: its cards in the site's grid, then a card-shaped button that adds one. */
export const CardGridView = (props: ElementTemplateProps<Record<string, never>>) => {
  const editor = useEditor();
  const isEmpty = () => !props.children.some((child) => child.type === "element");

  return (
    <Box padding="none" class="my-2 @container">
      {/* Like the site: one column, two while the grid is wide enough; the button is a cell. */}
      <Box padding="none" class="grid gap-4 @lg:grid-cols-2">
        <ContentSlot class="contents" contentClass="contents" />
        {/* A drop on the button goes at the end of the grid; a box selection over it selects it. */}
        <BlockArea block={props.key} droppable="append" selectable>
          <Button
            variant="ghost"
            class={clsx(
              "relative flex min-h-20 w-full items-center justify-center gap-2 rounded-xl border border-dashed",
              props.dropTarget ? "border-primary text-gray-700" : "border-gray-300 text-gray-500",
              isEmpty() && "col-span-full"
            )}
            onClick={() =>
              editor.append({
                type: "element",
                attrs: { name: "Card", props: { title: "Title" } }
              })
            }
          >
            <Icon name="i-lucide:plus" size="small" tone="muted" />
            Add card
            {/* As on a target card. */}
            <Show when={props.dropTarget}>
              <Box padding="none" class={clsx(SHADE_CLASS, "rounded-xl")} />
            </Show>
          </Button>
        </BlockArea>
      </Box>
    </Box>
  );
};
