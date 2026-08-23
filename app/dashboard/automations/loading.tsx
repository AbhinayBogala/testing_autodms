export default function Loading() {
  return (
    <div className="px-8 py-8">
      <div className="h-4 w-32 animate-pulse rounded bg-white/10" />
      <div className="mt-3 h-9 w-64 animate-pulse rounded bg-white/10" />
      <div className="mt-8 h-64 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}
