export function App() {
  return (
    <main className="app-shell">
      <section className="hero-panel" aria-labelledby="cradle-title">
        <p className="eyebrow">Cradle MVP foundation</p>
        <h1 id="cradle-title">A calm operating system for shared household life.</h1>
        <p>
          Phase 1 establishes the application shell, design tokens, test harness,
          Cloudflare Pages structure, and build discipline.
        </p>
      </section>

      <section className="status-grid" aria-label="Foundation status">
        <article>
          <h2>Responsive Shell</h2>
          <p>Ready for future household flows across mobile and desktop.</p>
        </article>
        <article>
          <h2>Cute Brutalist Tokens</h2>
          <p>Charcoal borders, solid colour surfaces, chunky spacing, no gradients.</p>
        </article>
        <article>
          <h2>Validated Slices</h2>
          <p>Each future slice must pass typecheck, lint, tests, build, and Git status.</p>
        </article>
      </section>
    </main>
  );
}
