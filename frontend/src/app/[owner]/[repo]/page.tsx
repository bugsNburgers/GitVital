type PageProps = {
    params: Promise<{
        owner: string;
        repo: string;
    }>;
};

export default async function RepoSwapPage({ params }: PageProps) {
    const { owner, repo } = await params;

    return (
        <main className="grid min-h-screen place-items-center bg-[#0E0F12] px-6 text-center text-[#E8EDF2]">
            <div className="space-y-3">
                <h1 className="text-3xl font-semibold">Repo Analysis Placeholder</h1>
                <p className="font-mono">
                    {owner}/{repo}
                </p>
                <p>URL swap route is wired.</p>
            </div>
        </main>
    );
}