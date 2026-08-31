/**
 * Reference-counted lock on page scrolling.
 *
 * The expanded map and the decision preview modal both need the page behind
 * them to stay put, and the modal opens from inside the expanded map. Each
 * saving and restoring `body.style.overflow` on its own meant whichever
 * unmounted first handed scrolling back while the other was still covering the
 * page, so the locks are counted and only the last release restores the value.
 */
let activeLocks = 0;
let overflowBeforeFirstLock = "";

export function lockBodyScroll() {
  if (typeof document === "undefined") return () => {};

  if (activeLocks === 0) {
    overflowBeforeFirstLock = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  activeLocks += 1;

  // React can invoke an effect cleanup more than once, and a double release
  // would unlock the page while another holder still needs it.
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLocks -= 1;
    if (activeLocks === 0) document.body.style.overflow = overflowBeforeFirstLock;
  };
}
