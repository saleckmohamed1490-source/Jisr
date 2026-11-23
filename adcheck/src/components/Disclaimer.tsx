import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

export function Disclaimer({ text, className }: { text: string; className?: string }) {
  return (
    <Alert variant="warning" role="note" className={cn(className)}>
      <TriangleAlert className="size-4" />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
