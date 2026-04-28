export function App() {
  return (
    <div className="app-shell">
      <header className="top-bar">CoFinder</header>
      <main className="pane-layout">
        <section className="pane">Local pane (M1)</section>
        <section className="splitter" />
        <section className="pane">Remote pane (M2)</section>
      </main>
      <footer className="bottom-bar">Transfer queue (M4)</footer>
    </div>
  );
}
