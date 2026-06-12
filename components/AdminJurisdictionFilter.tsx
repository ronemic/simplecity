export function AdminJurisdictionFilter({
  selected,
  includeAll = true
}: {
  selected: string;
  includeAll?: boolean;
}) {
  const publicSelected = selected === "san-mateo-city" ? "san-mateo" : selected;

  return (
    <form className="quiet-card mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:p-5">
      <label className="flex-1">
        <span className="text-xs font-bold uppercase text-black/70">Jurisdiction</span>
        <select name="jurisdiction" defaultValue={publicSelected} className="input-control mt-1">
          {includeAll ? <option value="all">All</option> : null}
          <option value="foster-city">Foster City</option>
          <option value="san-mateo">San Mateo</option>
          <option value="santa-clara-county">Santa Clara County</option>
        </select>
      </label>
      <button className="action-primary sm:mt-6">View</button>
    </form>
  );
}
