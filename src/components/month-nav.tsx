import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMonth, shiftMonth } from "@/lib/months";

// Переключатель месяца. onChange(null) — вернуться к текущему месяцу.
export function MonthNav({
  month,
  currentMonth,
  onChange,
}: {
  month: string;
  currentMonth: string;
  onChange: (month: string | null) => void;
}) {
  return (
    <div className="mb-4 flex items-center gap-1">
      <Button
        variant="outline"
        size="icon"
        aria-label="Предыдущий месяц"
        onClick={() => onChange(shiftMonth(month, -1))}
      >
        <ChevronLeft />
      </Button>
      <span className="min-w-36 text-center text-sm font-medium" aria-live="polite">
        {formatMonth(month)}
      </span>
      <Button
        variant="outline"
        size="icon"
        aria-label="Следующий месяц"
        onClick={() => onChange(shiftMonth(month, 1))}
      >
        <ChevronRight />
      </Button>
      {month !== currentMonth && (
        <Button variant="ghost" size="sm" onClick={() => onChange(null)}>
          Текущий
        </Button>
      )}
    </div>
  );
}
