// UI that drags its block, e.g. a card's title or a step's badge.
export const DRAG_CLASS = "cursor-grab active:cursor-grabbing";
// The site's card shell, e.g. of callouts, accordions, and tabs; add the layout.
export const CARD_CLASS =
  "rounded-xl border border-gray-200 bg-white shadow-[0_0_12px_0px] shadow-gray-200";
// The editor's block selection gradient, e.g. on a selected card or row; add the radius.
export const SHADE_CLASS =
  "pointer-events-none absolute inset-0 bg-gradient-to-r from-secondary via-primary to-transparent opacity-10";
// As the site's content: no outer margins on its first and last blocks.
export const CONTENT_CLASS = "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0";
