import { GRADE_STYLES, type Grade } from "@/lib/contracts/types";

export function GradeBadge({ grade, size = "md", label }: { grade: Grade; size?: "sm" | "md"; label?: string }) {
  const box = size === "md" ? "w-9 h-9 text-lg" : "w-6 h-6 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-lg border font-bold ${box} ${GRADE_STYLES[grade]}`}
      aria-label={label ?? `Grade ${grade}`}
    >
      {grade}
    </span>
  );
}
