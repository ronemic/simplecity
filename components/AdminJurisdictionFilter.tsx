export function AdminJurisdictionFilter({
  selected,
  includeAll = true
}: {
  selected: string;
  includeAll?: boolean;
}) {
  return (
    <form className="quiet-card mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
      <label className="flex-1">
        <span className="text-xs font-bold uppercase text-black/70">Jurisdiction</span>
        <select name="jurisdiction" defaultValue={selected} className="input-control mt-1">
          {includeAll ? <option value="all">All</option> : null}
          <option value="foster-city">Foster City</option>
          <option value="san-mateo-city">San Mateo</option>
        </select>
      </label>
      <button className="action-primary sm:mt-6">View</button>
    </form>
  );
}
