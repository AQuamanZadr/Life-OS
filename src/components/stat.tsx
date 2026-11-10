import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Карточка с одним показателем.
export function Stat({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  className?: string;
}) {
  return (
    <Card data-stat={label} className={className}>
      <CardContent>
        <p className="text-sm text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 text-lg font-semibold tabular-nums sm:text-xl",
            tone === "positive" && "text-success",
            tone === "negative" && "text-destructive",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}
