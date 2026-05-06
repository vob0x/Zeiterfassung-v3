/**
 * v3 Bootstrap-Shell. Im jetzigen Zustand zeigt die App nur einen
 * "Hello v3"-Screen — sobald M1 (Auth + Encryption) gestartet wird,
 * wandert hier die Auth-Wand und das Routing rein.
 */

export default function App() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-neutral-900 text-neutral-100 p-6">
      <div className="max-w-md text-center space-y-3">
        <div
          className="text-xs tracking-widest uppercase"
          style={{ color: '#C9A962' }}
        >
          Zeiterfassung
        </div>
        <h1 className="text-3xl font-bold">v3 — alpha</h1>
        <p className="text-sm text-neutral-400">
          Server-first Redesign. Skeleton steht. M1 (Auth + Encryption)
          ist der nächste Schritt.
        </p>
        <p className="text-xs text-neutral-500 pt-4">
          Die produktive App läuft weiterhin unter{' '}
          <span className="font-mono">v2</span>.
        </p>
      </div>
    </main>
  );
}
