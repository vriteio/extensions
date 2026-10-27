import clsx from "clsx";
import {
  Block,
  Box,
  ContentSlot,
  Element,
  useEditor,
  type ElementChild,
  type ElementTemplateProps
} from "@andesine/extensions/solid";
import { CARD_CLASS, CONTENT_CLASS } from "./classes";
import { createEffect, createMemo, createSignal, on } from "solid-js";
import { TabBar } from "./tab-bar";

interface TabProps {
  label?: string;
}

/**
 * The selected child of `type`, by its key, so it stays selected when the children move. It
 * follows the cursor, so a hidden child never takes typing; a removed one passes the selection on
 * to the child now at its place.
 */
const createSelection = (children: () => ElementChild[], type: string) => {
  const [selectedKey, setSelectedKey] = createSignal<string>();
  const items = createMemo(() => children().filter((child) => child.type === type));
  const selected = () => {
    return Math.max(
      items().findIndex(({ key }) => key === selectedKey()),
      0
    );
  };
  const setSelected = (index: number) => setSelectedKey(items()[index]?.key);

  let index = 0;

  createEffect(
    on(items, (current) => {
      const withCursor = current.find(({ hasSelection }) => hasSelection);
      const isKept = current.some(({ key }) => key === selectedKey());

      if (withCursor) setSelectedKey(withCursor.key);
      else if (!isKept) setSelectedKey(current[Math.min(index, current.length - 1)]?.key);

      index = selected();
    })
  );

  return { items, selected, setSelected };
};
/** The tab bar's items, with the block states that the tab buttons show. */
const toTabItems = (blocks: ElementChild[], getLabel: (block: ElementChild) => string) => {
  return blocks.map((block) => ({
    key: block.key,
    label: getLabel(block),
    blockSelected: block.blockSelected,
    dropTarget: block.dropTarget,
    dragged: block.dragged
  }));
};

/** `<Tabs syncKey>`, as the site shows it: the tab bar, then the selected tab's content. */
export const TabsView = (props: ElementTemplateProps<Record<string, unknown>>) => {
  const editor = useEditor();
  const tabs = createSelection(() => props.children, "element");
  const items = () => {
    return toTabItems(tabs.items(), (tab) => {
      return String((tab.props as TabProps)?.label || "Tab");
    });
  };
  // The new tab takes the cursor, which selects it.
  const add = () => {
    return editor.append({
      type: "element",
      attrs: { name: "Tab", props: { label: "Tab" } }
    });
  };

  return (
    <Box padding="none" class={clsx(CARD_CLASS, "my-2 overflow-clip")}>
      <TabBar
        block={props.key}
        dropTarget={props.dropTarget}
        items={items()}
        selected={tabs.selected()}
        variant="content"
        onSelect={tabs.setSelected}
        onAdd={add}
      />
      <ContentSlot placeholder="Add a tab with +" class="data-[empty]:px-4 data-[empty]:py-1">
        {/* Inactive tabs are hidden whole, so e.g. a block selection of one shows on its tab. */}
        <Block type="element">
          {(tab) => {
            const index = tabs.items().findIndex(({ key }) => key === tab.key);

            return { hidden: index !== tabs.selected() };
          }}
        </Block>
        <Element<TabProps> tag="Tab">
          {/* The padding is the slot's, so it counts as content for the drag handle. */}
          {() => (
            <ContentSlot
              controls
              class="px-4 py-3"
              placeholder="Write the tab's content"
              contentClass={CONTENT_CLASS}
            />
          )}
        </Element>
      </ContentSlot>
    </Box>
  );
};
/** `<CodeGroup>`, as the site shows it: tabs of the code blocks' titles or languages, then one block. */
export const CodeGroupView = (props: ElementTemplateProps<Record<string, unknown>>) => {
  const editor = useEditor();
  const blocks = createSelection(() => props.children, "codeBlock");
  // As on the site, a repeated label gets a number, e.g. `bash 2`.
  const items = () => {
    const counts = new Map<string, number>();

    return toTabItems(blocks.items(), (block) => {
      const label = block.title || block.language || "Code";
      const count = (counts.get(label) ?? 0) + 1;

      counts.set(label, count);

      return count > 1 ? `${label} ${count}` : label;
    });
  };
  // The new code block takes the cursor, which selects its tab.
  const add = () => editor.append({ type: "codeBlock" });

  return (
    <Box padding="none" class={clsx(CARD_CLASS, "my-2 overflow-clip")}>
      <TabBar
        block={props.key}
        dropTarget={props.dropTarget}
        items={items()}
        selected={blocks.selected()}
        variant="code"
        onSelect={blocks.setSelected}
        onAdd={add}
      />
      {/* The padding is the slot's, so it counts as content for the drag handle. */}
      <ContentSlot controls class="p-4" placeholder="Add code blocks; each one is a tab">
        {/* Plain: the card frames the code, as on the site. */}
        <Block type="codeBlock">
          {(block) => {
            const index = blocks.items().findIndex(({ key }) => key === block.key);

            return { hidden: index !== blocks.selected(), plain: true };
          }}
        </Block>
      </ContentSlot>
    </Box>
  );
};
