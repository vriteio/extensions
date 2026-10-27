import clsx from "clsx";
import {
  BlockArea,
  Box,
  Button,
  ContentSlot,
  Element,
  Icon,
  IconButton,
  Menu,
  MenuItem,
  MenuTrigger,
  Stack,
  Text,
  useEditor,
  type ElementTemplateProps
} from "@andesine/extensions/solid";
import { CONTENT_CLASS, DRAG_CLASS, SHADE_CLASS } from "./classes";
import { createMemo, Show, type JSX } from "solid-js";

interface StepProps {
  title?: string;
}
interface NameProps {
  name?: string;
}
interface TreeRowProps {
  /** The file's or folder's node ID: the row drags it, opens its menu, and selects it. */
  block: string;
  /** A folder's row takes a dropped item in, at the end; a file's row has the editor's drops. */
  droppable?: "append";
  icon: string;
  name: string;
  selected: boolean;
  dropTarget: boolean;
  dragged?: boolean;
  /** Actions after the name, e.g. a folder's menu. */
  children?: JSX.Element;
}
interface AddTreeItemMenuProps {
  class?: string;
}

// The place a dropped step takes: a dashed outline.
const STEP_DROP_CLASS =
  "pointer-events-none absolute -inset-x-2 -top-1 rounded-lg border border-dashed border-primary";
// The row a dropped item goes to: a dashed outline, as on steps and cards.
const TREE_DROP_CLASS =
  "pointer-events-none absolute inset-y-0 -left-1 right-0 rounded-lg border border-dashed border-primary";

/**
 * A file or folder row, as the site's explorer-like tree shows it. The row drags its item, opens
 * its menu, and marks its selection like the app's explorer: the gradient and a gradient icon.
 */
const TreeRow = (props: TreeRowProps) => (
  <BlockArea block={props.block} draggable menu controls selectable droppable={props.droppable}>
    {/* The space between rows is the rows', so the drag handle stays on them there. */}
    <Box padding="none" class="py-px">
      <Stack
        direction="row"
        gap="small"
        align="center"
        class={clsx(
          "group relative min-h-7 rounded-lg pl-0.5",
          DRAG_CLASS,
          props.dragged && "opacity-50"
        )}
      >
        <Icon
          name={props.icon}
          class={clsx("h-6 w-6", props.selected ? "bg-gradient-to-tr" : "text-gray-400")}
        />
        <Text size="base" weight="medium" class="line-clamp-1 min-w-0 leading-7 text-gray-700">
          {props.name}
        </Text>
        {props.children}
        {/* The editor shades the selection, across the selected rows. */}
        <Show when={props.dropTarget}>
          <Box padding="none" class={clsx(SHADE_CLASS, "rounded-lg")} />
          <Box padding="none" class={TREE_DROP_CLASS} />
        </Show>
      </Stack>
    </Box>
  </BlockArea>
);
/** A menu that adds a file or a folder at the end of the tree or folder whose view it's in. */
const AddTreeItemMenu = (props: AddTreeItemMenuProps) => {
  const editor = useEditor();

  return (
    <Menu>
      <MenuTrigger>
        <IconButton icon="i-lucide:plus" label="Add" size="small" class={props.class} />
      </MenuTrigger>
      {/* As the app's explorer: "New entry" and "New collection". */}
      <MenuItem
        label="New file"
        icon="i-lucide:file-plus-2"
        onSelect={() => {
          void editor.append({
            type: "element",
            attrs: {
              name: "File",
              props: { name: "file.ts" },
              selfClosing: true
            }
          });
        }}
      />
      <MenuItem
        label="New folder"
        icon="i-material-symbols:create-new-folder-outline-rounded"
        onSelect={() => {
          // Self-closing: an empty folder has no content, which the view would hide anyway.
          void editor.append({
            type: "element",
            attrs: {
              name: "Folder",
              props: { name: "folder" },
              selfClosing: true
            }
          });
        }}
      />
    </Menu>
  );
};

/** `<Steps>`, as the site shows it: numbered steps with a line between them, and a button. */
export const StepsView = (props: ElementTemplateProps<Record<string, never>>) => {
  const editor = useEditor();
  const count = createMemo(() => props.children.filter((child) => child.element === "Step").length);

  return (
    <Stack gap="medium" class="my-2">
      <ContentSlot placeholder="Add a step below">
        <Element<StepProps> tag="Step">
          {(step) => {
            const isLast = () => step.index >= count() - 1;

            // The whole step, e.g. the space between its title and text, has its handle and menu;
            // only the badge and the title drag it.
            return (
              <BlockArea block={step.key} menu controls selectable>
                <Box padding="none" class={clsx("relative pl-11", step.dragged && "opacity-50")}>
                  {/* The badge with its line, and the title, stand for the step. */}
                  <BlockArea block={step.key} draggable menu controls selectable droppable>
                    <Box padding="none" class={clsx("absolute inset-y-0 left-0 w-7", DRAG_CLASS)}>
                      <Box
                        padding="none"
                        class="flex h-7 w-7 items-center justify-center rounded-lg bg-white shadow-md shadow-gray-200 outline outline-1 -outline-offset-1 outline-gray-200"
                      >
                        <Text size="sm" weight="medium" class="text-gray-700">
                          {step.index + 1}
                        </Text>
                      </Box>
                      <Box
                        padding="none"
                        class="absolute bottom-0 left-3.5 top-9 w-px rounded-full bg-gray-200"
                      />
                    </Box>
                  </BlockArea>
                  <BlockArea block={step.key} draggable menu controls selectable droppable>
                    <Text
                      size="base"
                      weight="semibold"
                      class={clsx("mt-0.5 block leading-7 text-gray-900", DRAG_CLASS)}
                    >
                      {step.props.title || "Step"}
                    </Text>
                  </BlockArea>
                  {/* The space around the text is the slot's, so it counts as content. */}
                  <ContentSlot
                    controls
                    placeholder="Describe the step"
                    class={clsx("pt-1", !isLast() && "pb-4")}
                    contentClass={CONTENT_CLASS}
                  />
                  <Show when={step.dropTarget}>
                    <Box
                      padding="none"
                      class={clsx(STEP_DROP_CLASS, isLast() ? "-bottom-1" : "bottom-3")}
                    >
                      <Box padding="none" class={clsx(SHADE_CLASS, "rounded-lg")} />
                    </Box>
                  </Show>
                </Box>
              </BlockArea>
            );
          }}
        </Element>
      </ContentSlot>
      {/* A drop here goes at the end of the steps; a box selection here selects all. */}
      <BlockArea block={props.key} droppable="append" selectable>
        <Button
          variant="secondary"
          size="small"
          class={clsx(
            "relative flex items-center gap-1 self-start",
            props.dropTarget && "outline-dashed outline-1 outline-primary"
          )}
          onClick={() =>
            editor.append({
              type: "element",
              attrs: { name: "Step", props: { title: "Step" } }
            })
          }
        >
          <Icon name="i-lucide:plus" size="small" />
          Add step
          <Show when={props.dropTarget}>
            <Box padding="none" class={clsx(SHADE_CLASS, "rounded-md")} />
          </Show>
        </Button>
      </BlockArea>
    </Stack>
  );
};
/**
 * `<FileTree>`, as the site shows it: explorer-like rows, folders with a guide line. "+" menus add
 * items: the tree's below its rows, and a folder's after its name, shown on hover.
 */
export const FileTreeView = (props: ElementTemplateProps<Record<string, never>>) => (
  <Stack gap="none" class="my-2 font-medium text-gray-700">
    <ContentSlot contentClass="flex flex-col" placeholder="Add files and folders with +">
      <Element<NameProps> tag="Folder">
        {(folder) => (
          // The whole folder, e.g. its guide line, has its handle and menu; its row drags it.
          <BlockArea block={folder.key} menu controls selectable>
            <Stack gap="none" class={clsx(folder.dragged && "opacity-50")}>
              <TreeRow
                block={folder.key}
                droppable="append"
                icon="i-material-symbols:folder-open-rounded"
                name={folder.props.name || "folder"}
                selected={folder.inBlockSelection}
                dropTarget={folder.dropTarget}
              >
                {/* Smaller than the row; the row centers it. */}
                <AddTreeItemMenu class="rounded-md p-0.5 text-gray-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [[aria-expanded=true]_&]:opacity-100 [&_div]:h-4 [&_div]:w-4" />
              </TreeRow>
              {/* Like the site, an empty folder has no guide line or content. */}
              <Show when={folder.children.some((child) => child.type === "element")}>
                <Stack direction="row" gap="none">
                  {/* Like the site: a 14px column with the guide line at its end. */}
                  <Box padding="none" class="flex min-w-3.5 shrink-0 justify-end pl-0.5">
                    <Box padding="none" class="h-full w-px rounded-full bg-gray-300" />
                  </Box>
                  <Stack gap="none" class="min-w-0 flex-1">
                    <ContentSlot contentClass="flex flex-col" />
                  </Stack>
                </Stack>
              </Show>
            </Stack>
          </BlockArea>
        )}
      </Element>
      <Element<NameProps> tag="File">
        {(file) => (
          <TreeRow
            block={file.key}
            icon="i-lucide:file-text"
            name={file.props.name || "file"}
            selected={file.inBlockSelection}
            dropTarget={file.dropTarget}
            dragged={file.dragged}
          />
        )}
      </Element>
    </ContentSlot>
    {/* A drop on the button goes at the end of the tree. */}
    <BlockArea block={props.key} droppable="append">
      <Box padding="none" class="mt-px self-start">
        <AddTreeItemMenu
          class={clsx(
            "text-gray-400",
            props.dropTarget && "outline-dashed outline-1 outline-primary"
          )}
        />
      </Box>
    </BlockArea>
  </Stack>
);
