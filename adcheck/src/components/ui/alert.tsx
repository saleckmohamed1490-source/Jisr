import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-lg border px-4 py-3 text-sm [&>svg]:absolute [&>svg]:top-3.5 [&>svg]:start-4 [&>svg~*]:ps-7", {
  variants: {
    variant: {
      default: "bg-card text-card-foreground",
      destructive: "border-red-200 bg-red-50 text-red-800",
      warning: "border-amber-200 bg-amber-50 text-amber-900",
      success: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
  },
  defaultVariants: { variant: "default" },
});

function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}
function AlertTitle({ className, ...props }: React.ComponentProps<"h5">) {
  return <h5 data-slot="alert-title" className={cn("mb-1 font-medium leading-none", className)} {...props} />;
}
function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-sm [&_p]:leading-relaxed", className)} {...props} />;
}

export { Alert, AlertTitle, AlertDescription };
