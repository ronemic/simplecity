export function DecisionSearchForm({
  jurisdiction = "san-mateo",
  search = "",
  action,
  buttonLabel = "Filter",
  placeholder = "Search decisions..."
}: {
  jurisdiction?: string;
  search?: string;
  action?: string;
  buttonLabel?: string;
  placeholder?: string;
}) {
  return (
    <form className="quiet-card grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:p-5" action={action} role="search">
      <input type="hidden" name="jurisdiction" value={jurisdiction} />
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
