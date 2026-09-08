'use client';
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="min-h-dvh flex flex-col items-center justify-center gap-4 p-6 text-center">
    <h1 className="text-xl font-semibold">No se pudo cargar RutaTica</h1>
    <p>Intenta de nuevo. Si el problema continúa, vuelve más tarde.</p>
    <button className="min-h-11 rounded-lg bg-[#E31837] px-6 text-white" onClick={reset}>Reintentar</button>
  </main>;
}
