export default function Loading() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center space-y-4 px-4">
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-zinc-800 border-t-amber-500 animate-spin" />
        <div className="absolute inset-2 rounded-full border-2 border-zinc-800 border-b-amber-400 animate-spin animate-reverse" />
      </div>
      <p className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
        Memuat Atelier...
      </p>
    </div>
  );
}
