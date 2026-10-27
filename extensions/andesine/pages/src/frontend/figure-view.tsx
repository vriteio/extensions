import clsx from "clsx";
import {
  BlockArea,
  ContentSlot,
  Stack,
  Text,
  type ElementTemplateProps
} from "@andesine/extensions/solid";
import { CONTENT_CLASS, DRAG_CLASS } from "./classes";

interface FigureProps {
  caption?: string;
}

/**
 * `<Figure caption>`: content with its caption below, as the site shows it. The caption drags the
 * figure, opens its menu, which edits the caption, and selects it. A dashed frame shows what's in
 * the figure while it's hovered or the cursor is in it, on the edges of the editor's block shade;
 * the site has none.
 */
export const FigureView = (props: ElementTemplateProps<FigureProps>) => {
  const hasCursor = () => props.children.some(({ hasSelection }) => hasSelection);

  return (
    <Stack
      gap="none"
      class={clsx(
        "relative my-2 before:pointer-events-none before:absolute before:-inset-x-2 before:-inset-y-1 before:rounded-lg before:border before:border-dashed before:content-empty",
        hasCursor()
          ? "before:border-gray-300"
          : "before:border-transparent hover:before:border-gray-300",
        props.dragged && "opacity-50"
      )}
    >
      <ContentSlot controls placeholder="Add captioned content" contentClass={CONTENT_CLASS} />
      <BlockArea block={props.key} draggable menu selectable>
        <Text size="sm" tone="muted" class={clsx("mt-2 text-center", DRAG_CLASS)}>
          {props.props.caption || "Caption"}
        </Text>
      </BlockArea>
    </Stack>
  );
};
