export function DecisionSearchForm({
  search = "",
  action,
  buttonLabel = "Filter",
  placeholder = "Search decisions..."
}: {
  search?: string;
  action?: string;
  buttonLabel?: string;
  placeholder?: string;
}) {
  return (
    <form className="quiet-card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:p-5" action={action} role="search">
      <input
        name="q"
        defaultValue={search}
        placeholder={placeholder}
        className="input-control"
      />
      <button className="action-primary">{buttonLabel}</button>
    </form>
  );
}
