export default function HomePage() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0E0F12] px-6 text-center text-[#E8EDF2]">
      <div className="space-y-3">
        <h1 className="text-3xl font-semibold">GitVital URL Swap</h1>
        <p>Replace github.com with gitvital.com in any repository URL.</p>
        <p className="font-mono">Example: gitvital.com/facebook/react</p>
      </div>
    </main>
  );
}
