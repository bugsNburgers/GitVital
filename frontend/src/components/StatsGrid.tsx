import { useEffect, useState, useRef } from "react";

interface StatItem {
    label: string;
    targetValue: string;
}

const TOTAL_BOXES = 32;
const TOP_GRID_ROWS = 1;
const BOTTOM_GRID_ROWS = 1;

export function StatsGrid() {
    const stats: StatItem[] = [
        { label: "PROFILES", targetValue: "2,568,376" },
        { label: "REPOSITORIES", targetValue: "8,046,382" },
        { label: "ANALYSES", targetValue: "44,682,649" },
        { label: "ACTIVE USERS", targetValue: "116,802,629,281" },
        { label: "LOG EVENTS", targetValue: "464,421,007,363" },
    ];

    const [displayValues, setDisplayValues] = useState<string[]>(
        stats.map(() => "0")
    );
    const [isVisible, setIsVisible] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const GRID_ROWS = TOP_GRID_ROWS + stats.length + BOTTOM_GRID_ROWS;

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsVisible(true);
                    }
                });
            },
            { threshold: 0.3 }
        );

        if (containerRef.current) {
            observer.observe(containerRef.current);
        }

        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        if (!isVisible) return;

        const duration = 2000;
        const steps = 60;
        const stepDuration = duration / steps;
        let currentStep = 0;

        const interval = setInterval(() => {
            currentStep++;
            const progress = currentStep / steps;

            setDisplayValues(
                stats.map((stat) => {
                    const targetNum = parseInt(stat.targetValue.replace(/,/g, ""));
                    const currentNum = Math.floor(targetNum * progress);
                    return currentNum.toLocaleString();
                })
            );

            if (currentStep >= steps) {
                clearInterval(interval);
                setDisplayValues(stats.map((stat) => stat.targetValue));
            }
        }, stepDuration);

        return () => clearInterval(interval);
    }, [isVisible]);

    const renderRow = (label: string, value: string, index: number) => {
        const boxes = [];

        // Combine label and value with spacing
        const labelChars = label.split("");
        const valueChars = value.split("");

        // Calculate spacing - keep label and value closer together
        const labelStart = 2;
        const labelEnd = labelStart + labelChars.length;
        const valueEnd = TOTAL_BOXES - 2;
        const valueStart = valueEnd - valueChars.length;

        for (let i = 0; i < TOTAL_BOXES; i++) {
            let char = "";
            let isLabel = false;
            let isValue = false;

            if (i >= labelStart && i < labelEnd) {
                char = labelChars[i - labelStart];
                isLabel = true;
            } else if (i >= valueStart && i < valueEnd) {
                char = valueChars[i - valueStart];
                isValue = true;
            }

            boxes.push(
                <div
                    key={i}
                    className={`
            h-16 min-w-0
            flex items-center justify-center
            transition-all duration-500
            ${isVisible ? "bg-white/5 border border-white/10" : "bg-transparent border border-transparent"}
            rounded-sm
            font-mono
            ${isValue ? "text-white text-[clamp(1.2rem,2.3vw,2.1rem)] font-semibold" : isLabel ? "text-slate-400 text-[clamp(1rem,1.6vw,1.5rem)]" : ""}
            ${!char ? "opacity-20" : ""}
          `}
                    style={{
                        transitionDelay: isVisible ? `${index * 50 + i * 10}ms` : "0ms",
                    }}
                >
                    {char}
                </div>
            );
        }

        return boxes;
    };

    const renderEmptyRow = (rowKey: string) => {
        return (
            <div
                key={rowKey}
                className="relative z-10 grid gap-0.5"
                style={{ gridTemplateColumns: `repeat(${TOTAL_BOXES}, minmax(0, 1fr))` }}
            >
                {Array.from({ length: TOTAL_BOXES }).map((_, i) => (
                    <div
                        key={`${rowKey}-${i}`}
                        className={`
            h-16 min-w-0
            flex items-center justify-center
            transition-all duration-500
            ${isVisible ? "bg-white/5 border border-white/10" : "bg-transparent border border-transparent"}
            rounded-sm opacity-20
          `}
                    ></div>
                ))}
            </div>
        );
    };

    return (
        <div
            ref={containerRef}
            className="relative w-full min-h-[560px] bg-black overflow-hidden flex items-center justify-center py-14 px-4"
        >
            {/* Stats content */}
            <div
                className="relative z-10 space-y-0.5 flex w-full max-w-7xl flex-col"
            >
                {/* Subtle aligned guide grid (same geometry as box grid) */}
                <div className="absolute inset-0 pointer-events-none z-0">
                    <div className="h-full w-full grid gap-0.5"
                        style={{ gridTemplateColumns: `repeat(${TOTAL_BOXES}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${GRID_ROWS}, minmax(0, 1fr))` }}
                    >
                        {Array.from({ length: TOTAL_BOXES * GRID_ROWS }).map((_, idx) => (
                            <span
                                key={`guide-${idx}`}
                                className="rounded-sm border border-white/5 bg-transparent"
                            ></span>
                        ))}
                    </div>
                </div>

                {Array.from({ length: TOP_GRID_ROWS }).map((_, idx) =>
                    renderEmptyRow(`top-row-${idx}`)
                )}

                {stats.map((stat, index) => (
                    <div
                        key={index}
                        className="relative z-10 grid gap-0.5"
                        style={{ gridTemplateColumns: `repeat(${TOTAL_BOXES}, minmax(0, 1fr))` }}
                    >
                        {renderRow(stat.label, displayValues[index], index)}
                    </div>
                ))}

                {Array.from({ length: BOTTOM_GRID_ROWS }).map((_, idx) =>
                    renderEmptyRow(`bottom-row-${idx}`)
                )}
            </div>
        </div>
    );
}