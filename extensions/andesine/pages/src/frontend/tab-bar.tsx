import clsx from "clsx";
import { BlockArea, Box, Button, IconButton, Stack } from "@andesine/extensions/solid";
import { For, Index, Show } from "solid-js";
import { SHADE_CLASS } from "./classes";

interface TabBarItem {
  /** The tab's node ID: the tab drags it, opens its menu, selects it, and takes a drop's place. */
  key: string;
  label: string;
  /** A block selection covers the tab's block, e.g. after a right click; the tab shows it. */
  blockSelected: boolean;
  /** A dropped tab takes this tab's place. */
  dropTarget: boolean;
  dragged: boolean;
}
interface TabBarProps {
  /** The wrapper's node ID: "+" adds to it, takes drops at its end, and selects it. */
  block: string;
  /** A drop goes at the wrapper's end, by "+". */
  dropTarget: boolean;
  items: TabBarItem[];
  selected: number;
  variant: "content" | "code";
  onSelect(index: number): void;
  onAdd(): void;
}

// The template's tab triggers: a segmented control for content, monospace with a hover line for
// code. Outlines are pseudo-elements, since the button's focus style removes outlines.
const TRIGGER_CLASSES = {
  content: "rounded-md px-2 py-0.5 text-sm font-normal",
  code: "h-full rounded-none px-1.5 font-mono text-xs font-normal after:pointer-events-none after:absolute after:inset-x-1.5 after:bottom-0 after:h-px after:bg-gray-400 after:opacity-0 after:transition-opacity after:duration-200 after:content-empty hover:after:opacity-100 focus-visible:after:opacity-100"
};
// Code tabs' gradient text, for the selected tab and a block-selected one.
const GRADIENT_TEXT_CLASS =
  "bg-gradient-to-tr bg-[length:125%_auto] bg-clip-text text-transparent hover:bg-transparent focus-visible:bg-transparent";
const SELECTED_CLASSES = {
  content:
    "bg-white text-gray-700 shadow-md hover:bg-white focus-visible:bg-white after:pointer-events-none after:absolute after:-inset-px after:rounded-[7px] after:border after:border-gray-200 after:content-empty",
  // Gradient text, and the site's indicator on the header's bottom line in place of the hover line.
  code: "after:hidden before:pointer-events-none before:absolute before:inset-x-0 before:bottom-[-0.5px] before:h-0.5 before:rounded-full before:bg-gradient-to-r before:content-empty"
};
// A content tab's block is selected, e.g. by a right click: the primary button's look.
const BLOCK_SELECTED_CLASS =
  "bg-gradient-to-tr bg-[length:125%_auto] text-white shadow-md hover:text-white focus-visible:text-white before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:border before:border-tertiary before:content-empty";
// A code tab's block is selected: the editor's block selection shade, from the bottom up to 3/5.
const BLOCK_SHADE_CLASS =
  "pointer-events-none absolute inset-x-0 bottom-0 h-3/5 rounded-none bg-gradient-to-t from-secondary via-primary/50 to-transparent opacity-20";
// The place a dropped tab takes, or "+" for the end: a dashed outline with the selection gradient.
// Code tabs: a dashed line on the header's bottom line, with the shade from the bottom up.
const DROP_CLASSES = {
  content: [
    clsx(SHADE_CLASS, "rounded-md"),
    "pointer-events-none absolute inset-0 rounded-md border border-dashed border-primary"
  ],
  code: [
    BLOCK_SHADE_CLASS,
    "pointer-events-none absolute inset-x-0 bottom-0 h-0 rounded-none border-b border-dashed border-primary"
  ]
};
const UNSELECTED_CLASS =
  "text-gray-500 hover:bg-transparent hover:text-gray-700 focus-visible:bg-transparent focus-visible:text-gray-700";

/** The header of the site's tab cards, with a button after the tabs that adds one. */
const TabBar = (props: TabBarProps) => (
  <Stack
    direction="row"
    gap="small"
    class={clsx(
      "relative h-9 after:pointer-events-none after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-gray-200 after:content-empty",
      props.variant === "content" ? "bg-gray-100" : "pl-1.5 pr-1"
    )}
  >
    {/*
      As the site's tab list: scrolling clips, so the padding and height inside give shadows room,
      and it's over the header's bottom line. Code tabs reach 1px below it, so their indicator is
      centered on the line.
    */}
    <Stack
      direction="row"
      gap="small"
      align="center"
      class={clsx(
        "relative z-1 min-w-0 flex-1 self-stretch overflow-x-auto pb-px text-gray-500",
        props.variant === "content" ? "px-1" : "-mb-px"
      )}
    >
      {/* By index: the buttons stay while their flags change; a drag needs its source. */}
      <Index each={props.items}>
        {(item, index) => {
          const isFilled = () => item().blockSelected && props.variant === "content";
          const isShaded = () => item().blockSelected && props.variant === "code";
          const isGradient = () => {
            return props.variant === "code" && (isShaded() || index === props.selected);
          };
          const stateClass = () => {
            if (isFilled()) return BLOCK_SELECTED_CLASS;
            if (index === props.selected) return SELECTED_CLASSES[props.variant];

            return isShaded() ? "" : UNSELECTED_CLASS;
          };

          return (
            <BlockArea
              block={item().key}
              draggable
              droppable
              menu
              selectable
              marksSelection
              onActivate={() => props.onSelect(index)}
            >
              <Button
                variant="ghost"
                size="small"
                class={clsx(
                  "shrink-0 active:cursor-grabbing",
                  TRIGGER_CLASSES[props.variant],
                  stateClass(),
                  isGradient() && GRADIENT_TEXT_CLASS,
                  item().dragged && "opacity-50"
                )}
                onClick={() => props.onSelect(index)}
              >
                {item().label}
                <Show when={isShaded()}>
                  <Box padding="none" class={BLOCK_SHADE_CLASS} />
                </Show>
                <Show when={item().dropTarget}>
                  <For each={DROP_CLASSES[props.variant]}>
                    {(dropClass) => <Box padding="none" class={dropClass} />}
                  </For>
                </Show>
              </Button>
            </BlockArea>
          );
        }}
      </Index>
      {/* A drop on it goes at the end; a box selection over it selects the wrapper. */}
      <BlockArea block={props.block} droppable="append" selectable>
        <Box padding="none" class="relative shrink-0 rounded-md">
          <IconButton
            icon="i-lucide:plus"
            label="Add tab"
            size="small"
            class="rounded-md p-1 [&_div]:h-4 [&_div]:w-4"
            onClick={() => props.onAdd()}
          />
          <Show when={props.dropTarget}>
            <For each={DROP_CLASSES.content}>
              {(dropClass) => <Box padding="none" class={dropClass} />}
            </For>
          </Show>
        </Box>
      </BlockArea>
    </Stack>
  </Stack>
);

export { TabBar };
