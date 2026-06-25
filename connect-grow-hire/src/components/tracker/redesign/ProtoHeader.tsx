// Page header row: title + subtitle on the left. The proto's "Ask Scout"
// button was removed because the global AppHeader already renders one at
// the top-right of the page; keeping both was visually redundant.

export function ProtoHeader() {
  return (
    <div className="header-row">
      <div className="page-header-block">
        <h1 className="page-title">Your Inbox</h1>
        <p className="page-subtitle">Stay on top of every conversation</p>
      </div>
    </div>
  );
}
