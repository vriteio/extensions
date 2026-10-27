import { Callout, SaveBar } from "@andesine/extensions/solid";
import { createSignal, Show, type Component } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { callBackend, type SiteView } from "./api";
import { fromConfig, toConfig } from "./config-form";
import { SiteFrame, type SitePageProps } from "./site-frame";
import type { SiteStatus } from "./site-status";

interface SettingsFormProps {
  site: () => SiteView;
  status: SiteStatus;
  fields: Component<{ form: SiteForm }>;
}

type SiteForm = ReturnType<typeof createSiteForm>;

/**
 * The site's configuration as a form. Each settings page edits its part; a save sends all of it,
 * so the other parts stay as they are.
 */
const createSiteForm = (site: () => SiteView, status: SiteStatus) => {
  const [form, setForm] = createStore(fromConfig(site().config));
  const [saving, setSaving] = createSignal(false);
  const [error, setError] = createSignal<string | null>(null);
  const disabled = () => !status.loaded()?.canManage;
  // Unsaved when the form's configuration differs from the saved one.
  const isDirty = () => {
    return JSON.stringify(toConfig(form)) !== JSON.stringify(toConfig(fromConfig(site().config)));
  };
  const discard = () => {
    setForm(reconcile(fromConfig(site().config)));
    setError(null);
  };
  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      const result = await callBackend<{ site: SiteView }>("save", {
        collectionID: site().collectionID,
        config: toConfig(form)
      });

      status.update({ site: result.site });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "The settings weren't saved");
    } finally {
      setSaving(false);
    }
  };

  return {
    site,
    form,
    setForm,
    saving,
    error,
    setError,
    disabled,
    isDirty,
    discard,
    save
  };
};
const SettingsForm = (props: SettingsFormProps) => {
  const form = createSiteForm(props.site, props.status);

  return (
    <>
      <props.fields form={form} />
      <Show when={form.error()}>{(message) => <Callout tone="danger">{message()}</Callout>}</Show>
      <SaveBar
        dirty={!form.disabled() && form.isDirty()}
        saving={form.saving()}
        saveLabel="Save"
        onSave={form.save}
        onDiscard={form.discard}
      />
    </>
  );
};
/** A settings page of the site, with the fields of its part of the configuration. */
const createSettingsPage = (fields: Component<{ form: SiteForm }>) => {
  return (props: SitePageProps) => (
    <SiteFrame {...props}>
      {(site, status) => <SettingsForm site={site} status={status} fields={fields} />}
    </SiteFrame>
  );
};

export { createSettingsPage };
export type { SiteForm };
