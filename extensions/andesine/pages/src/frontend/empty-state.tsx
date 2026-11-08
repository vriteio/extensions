import { List } from "@andesine/extensions/solid";

interface EmptyStateProps {
  icon: string;
  label: string;
}

/** A placeholder for an empty list, on the card of the app's empty lists, e.g. "No links". */
const EmptyState = (props: EmptyStateProps) => (
  <List emptyIcon={props.icon} emptyLabel={props.label} disabled />
);

export { EmptyState };
