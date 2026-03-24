"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";

const ALL_LEADERS = [
  { rank: 1, name: "Sarah Drasner", handle: "@sdras", score: 98.42, lang: "TypeScript", repos: 142, percentile: "Top 0.1%", tier: "gold", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuCVeEhn4a9onTKoxR9BossCjCG93QhNm6nCP8FVDRShBX0orgX-qUum39-FmVKWC-8WFY2UVqvdOQcetR6qT9SoeJCcBiamxyrsmNgAu1o_ePy6les3koOzGPPHLhyacM5Kh0NK4R6HpS_WytpDuAAAT6gA2tN1zFipEhKVD-QPH47e14gILmGTqTrh4oG3VxeFSLQ0-hnEaQzyDdcujJPP-cAR4AP-d4N-fHXnhnl261Yp1lVImTPapDj1her2nVHhEnD3GmxWMSk" },
  { rank: 2, name: "Guillermo Rauch", handle: "@rauchg", score: 97.88, lang: "JavaScript", repos: 89, percentile: "Top 0.5%", tier: "silver", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuDFXktmnwLk-tpnLLudaOs881mjhXhuWINqXUBv7QfBIZhZ9689pxorB21b1_vyJKC463L2OOyS3CwtKZr6lNnNXFlrgEjZZ0EGPQbqaMqKhZ2JQNHk1ORSCV-CRsew9jw0KMUTa9ftA5pMgfqFYtydNnbhknfNmU276kSHwTzJlDQXjK7Q-1p-IrMB9McAs9kgD9FuWwSqFs08dThxEkMcEdsRq5hgp-eSsdIwtEifw0YcWAt0q-bST5OWuHWKRnzqxsRYfyVQKjE" },
  { rank: 3, name: "Kelsey Hightower", handle: "@kelseyhightower", score: 97.15, lang: "Go", repos: 114, percentile: "Top 1%", tier: "bronze", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuAmTa2OyqZunjQsZv0euTMA6Hov1fmWTmjKrMo4-cVkEuu3iwqUDy_2L6vYwQZ4F8ug0S8kklnVB_1cEIj4hAirKzBvMaPYHQdXnn1umYIOwfiFG4heIY761N7J2w_7xXavxeN1ivkjy954VRbDAw7jOWszH2cGaPgoKA0cTG9VyUzQWY52FqhEJDMjhvn9IKdw9aQJeC-5JDxD47e0rYgT8b8ogkg6hMpwXKUUWhhbJJOO5dasAysvaYjlGGi6cvVdNFDqZQjVRS0" },
  { rank: 4, name: "Dan Abramov", handle: "@gaearon", score: 95.82, lang: "React", repos: 230, percentile: "Top 2%", tier: "other", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuC3ZhMgjgtaI0_qhz1eXtENouW5Vc-yJac6lLx4bt8I0u8euFCGJpd4f0BlZHYo040Rd7ZnZ6gIy5llXS8ioXGSx5T-ediT1LBc0BVkkkrZqyyLCYbep_zvq2YV1qnTy3HY67R-rS-NfUaio-GxDKmE5pcXaXioUS87IREVWtOhbL9OjKb7GoSroUkwX7zM7ug1Qd7Zp_McuwvSLqwnb_niUarPSj2HhaRibsVBY-t65oG9dkp-cFBLric_CM8H36-_Nky62ekSocQ" },
  { rank: 5, name: "Evan You", handle: "@yyx990803", score: 95.21, lang: "Vue", repos: 167, percentile: "Top 2%", tier: "other", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuA0xfmc-aNFDuHFZJGmbma3gYifJjprgEhr5CGM9FheY2gc9hQgYaV7P1nFaYDSAXfzA3kG9dg-tKl23VUImWutSqQar3CwDYR_wzXHgBPm7JgRLGVO9vq5x793JELLKWtME9Om6Om1ecGVIw3tjjITjaqi3W9PxRSKQM13477x8-dNgmlBnJ5glyjprpAhPblxWdP6P6sZRZZ0SW1tV9y2mw1QSJLMo3bjTsI3Ifjiip5ePdkce_Ztgd62iSkI7zygllL4jptrBfI" },
  { rank: 6, name: "Lea Verou", handle: "@leaverou", score: 94.75, lang: "CSS", repos: 92, percentile: "Top 3%", tier: "other", img: "https://lh3.googleusercontent.com/aida-public/AB6AXuA19Otx3E8FnozX0NZbU2M0bMLrx1NVR0JTeyA2mCSl9y2yz76VD630_m4n5CEDwR6wtr9HBUVyVoRmDNN28qh_6_oQc_6q7YX1WO5fPvXhev2vP6DE0E48N7MarhLHs_JSA_AzaF0KS7h4X_WBbU0I0lN8vw2yCoxLjPDUI_ZYYtTNRqzAReJsYnMonz0mxbQ4bG0XZfMpYEOhXomwHUWo8zElmSNm_NzoiPRAVrF0tavjk1JtKpKsDF8uRSQF-Ww9GvS8wht2SFI" },
];

const PAGE_SIZE = 6;

function getTierClass(tier: string) {
  if (tier === "gold") return "gold-glow";
  if (tier === "silver") return "silver-glow";
  if (tier === "bronze") return "bronze-glow";
  return "";
}

function getRankIcon(tier: string) {
  if (tier === "gold") return <div className="flex items-center justify-center size-10 rounded-full bg-yellow-500/10 text-yellow-500"><span className="material-symbols-outlined font-bold">workspace_premium</span></div>;
  if (tier === "silver") return <div className="flex items-center justify-center size-10 rounded-full bg-slate-400/10 text-slate-400"><span className="material-symbols-outlined font-bold">workspace_premium</span></div>;
  if (tier === "bronze") return <div className="flex items-center justify-center size-10 rounded-full bg-orange-600/10 text-orange-600"><span className="material-symbols-outlined font-bold">workspace_premium</span></div>;
  return null;
}

function getPercentileBadge(percentile: string, tier: string) {
  if (tier === "gold") return <span className="bg-primary px-3 py-1 rounded-lg text-slate-900 text-xs font-black uppercase">{percentile}</span>;
  if (tier === "silver") return <span className="bg-primary/30 px-3 py-1 rounded-lg text-primary text-xs font-black uppercase">{percentile}</span>;
  if (tier === "bronze") return <span className="bg-primary/20 px-3 py-1 rounded-lg text-primary/80 text-xs font-black uppercase">{percentile}</span>;
  return <span className="bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-lg text-slate-600 dark:text-slate-400 text-xs font-black uppercase">{percentile}</span>;
}

function getAvatarBorder(tier: string) {
  if (tier === "gold") return "border-2 border-yellow-500/50 p-0.5";
  if (tier === "silver") return "border-2 border-slate-400/50 p-0.5";
  if (tier === "bronze") return "border-2 border-orange-600/50 p-0.5";
  return "bg-slate-800";
}

export default function LeaderboardPage() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [langFilter, setLangFilter] = useState("All Languages");
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    return ALL_LEADERS.filter((l) => {
      const matchesSearch = l.name.toLowerCase().includes(searchQuery.toLowerCase()) || l.handle.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesLang = langFilter === "All Languages" || l.lang === langFilter;
      return matchesSearch && matchesLang;
    });
  }, [searchQuery, langFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleLangChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setLangFilter(e.target.value);
    setCurrentPage(1);
  }

  function handleSearch(e: React.ChangeEvent<HTMLInputElement>) {
    setSearchQuery(e.target.value);
    setCurrentPage(1);
  }

  return (
    <body className="bg-background-light dark:bg-background-dark text-slate-900 dark:text-slate-100 min-h-screen">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-50 w-full border-b border-slate-200 dark:border-slate-800 bg-background-light/80 dark:bg-background-dark/80 backdrop-blur-md px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => router.push("/")}>
              <img alt="GitVital logo" className="h-11 w-auto md:h-12" src="/gitvital_logo_fixed.svg" />
              <h2 className="text-slate-900 dark:text-white text-2xl font-black tracking-tight">Git Vital</h2>
            </div>
            <nav className="hidden md:flex items-center gap-6">
              <a className="text-slate-600 dark:text-slate-400 hover:text-primary transition-colors text-sm font-semibold" href="/">Explore</a>
              <a className="text-primary text-sm font-semibold border-b-2 border-primary pb-1" href="/leaderboard">Leaderboard</a>
              <a className="text-slate-600 dark:text-slate-400 hover:text-primary transition-colors text-sm font-semibold" href="#">Insights</a>
            </nav>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative hidden sm:block">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
              <input
                className="pl-10 pr-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border-none focus:ring-2 focus:ring-primary w-64 text-sm"
                placeholder="Search developers..."
                type="text"
                value={searchQuery}
                onChange={handleSearch}
              />
            </div>
            <div className="size-10 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center overflow-hidden">
              <img alt="User Avatar" className="w-full h-full object-cover" src="https://lh3.googleusercontent.com/aida-public/AB6AXuAu23btG1duseEZA5t7fjAbJWCD8cml09_ISNVmnLAECI5iufpmjHfVvPT7LEMo0VCg1x-dZfJxzCNX1SfWT1qCSToTXBRbQNV3K59WYqDrqGXtSNUFx5KNq_UWhmNTqCRrkIzmqME4QOfYY5_DnJIwgrXYeobF9_KL8S-V0oQQ5naEIiV69IEU4t-S18SuYw6wF03_V6y9O92Clp2XlV9vNvbRypqxaNA9OjNDZE6BoYaS5fu9Y3pw2bbQzvtb8kEHrGZLcedJFr4" />
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-6 py-12">
        {/* Hero Section */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
          <div className="space-y-3">
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 dark:text-white">
              Developer <span className="text-primary">Leaderboard</span>
            </h1>
            <p className="text-slate-600 dark:text-slate-400 max-w-xl text-lg">
              Recognizing the world&apos;s most impactful open-source contributors based on code quality, velocity, and community impact.
            </p>
          </div>
          <div className="flex flex-col gap-2 min-w-[240px]">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Filter by Language</label>
            <div className="relative">
              <select
                aria-label="Filter developers by programming language"
                className="w-full appearance-none bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-3 pr-10 focus:ring-2 focus:ring-primary focus:border-primary text-sm font-medium"
                value={langFilter}
                onChange={handleLangChange}
              >
                <option>All Languages</option>
                <option>TypeScript</option>
                <option>Python</option>
                <option>Rust</option>
                <option>Go</option>
                <option>JavaScript</option>
                <option>Vue</option>
                <option>React</option>
                <option>CSS</option>
              </select>
              <span className="material-symbols-outlined absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">expand_more</span>
            </div>
          </div>
        </div>
        {/* Leaderboard Table */}
        <div className="glass-card rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 w-24">Rank</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Developer</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Score</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Language</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500">Repos</th>
                  <th className="px-6 py-4 text-xs font-bold uppercase text-slate-500 text-right">Percentile</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {paged.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">No developers match your filter.</td>
                  </tr>
                ) : (
                  paged.map((leader) => (
                    <tr
                      key={leader.handle}
                      className={`${getTierClass(leader.tier)} transition-colors hover:bg-primary/5 cursor-pointer`}
                      onClick={() => router.push(`/${leader.handle.replace("@", "")}`)}
                    >
                      <td className="px-6 py-6">
                        {leader.tier !== "other"
                          ? getRankIcon(leader.tier)
                          : <div className="flex items-center justify-center size-10 font-black text-slate-500">{leader.rank}</div>
                        }
                      </td>
                      <td className="px-6 py-6">
                        <div className="flex items-center gap-4">
                          <img alt={leader.name} className={`size-12 rounded-full ${getAvatarBorder(leader.tier)}`} src={leader.img} />
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white">{leader.name}</div>
                            <div className="text-xs text-slate-500">{leader.handle}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-6 font-mono font-bold text-lg">{leader.score}</td>
                      <td className="px-6 py-6">
                        <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">{leader.lang}</span>
                      </td>
                      <td className="px-6 py-6 text-slate-600 dark:text-slate-400 font-medium">{leader.repos}</td>
                      <td className="px-6 py-6 text-right">{getPercentileBadge(leader.percentile, leader.tier)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/* Footer Info + Pagination */}
        <div className="mt-8 flex flex-col md:flex-row items-center justify-between gap-6 px-4">
          <div className="flex items-center gap-2 text-slate-500 text-sm">
            <span className="material-symbols-outlined text-sm">info</span>
            Calculated based on commits, PRs, and stars over the last 365 days.
          </div>
          <div className="flex items-center gap-4">
            <button
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-bold hover:text-primary transition-colors disabled:opacity-40"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <span
                  key={p}
                  className={`size-8 flex items-center justify-center rounded cursor-pointer text-sm font-bold transition-colors ${currentPage === p
                    ? "bg-primary text-slate-900 font-black"
                    : "hover:bg-slate-100 dark:hover:bg-slate-800"
                    }`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </span>
              ))}
            </div>
            <button
              className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-sm font-bold hover:text-primary transition-colors disabled:opacity-40"
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </div>
      </main>
      {/* Bottom Stat Cards */}
      <section className="max-w-7xl mx-auto px-6 pb-20 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-card rounded-xl p-6 flex items-center gap-5">
          <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-3xl">groups</span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">12.4M</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Developers</div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-6 flex items-center gap-5">
          <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-3xl">code_blocks</span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">850K</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Repos Analyzed</div>
          </div>
        </div>
        <div className="glass-card rounded-xl p-6 flex items-center gap-5">
          <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
            <span className="material-symbols-outlined text-3xl">bolt</span>
          </div>
          <div>
            <div className="text-2xl font-black text-slate-900 dark:text-white">Real-time</div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-widest">Update Frequency</div>
          </div>
        </div>
      </section>
    </body>
  );
}
