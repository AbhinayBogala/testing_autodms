import Link from "next/link";

export default function Home() {
  return <main className="min-h-screen bg-black px-6 py-20 text-white"><div className="mx-auto max-w-4xl"><p className="text-sm uppercase tracking-[.3em] text-gray-600">Auto DM</p><h1 className="mt-4 text-5xl font-bold tracking-tight">Instagram automation without the manual work.</h1><p className="mt-5 max-w-2xl text-lg text-gray-400">Connect a professional Instagram account, sync posts and comments, build keyword automations, reply to threaded comments and receive Instagram messages in one dashboard.</p><Link href="/login" className="mt-8 inline-flex rounded-lg bg-white px-5 py-3 font-semibold text-black hover:bg-gray-200">Open dashboard</Link></div></main>;
}
