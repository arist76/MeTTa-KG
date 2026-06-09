import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import * as ButtonPrimitive from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 relative overflow-hidden",
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground",
          "hover:brightness-110",
          "hover:shadow-[0_0_20px_hsl(var(--primary)/0.4)]",
        ],
        destructive: [
          "bg-destructive text-destructive-foreground",
          "hover:bg-destructive/90",
        ],
        outline: [
          "border border-border bg-background",
          "text-foreground hover:bg-muted hover:border-primary/50",
          "hover:shadow-[0_0_15px_hsl(var(--primary)/0.2)]",
        ],
        secondary: [
          "bg-secondary text-secondary-foreground",
          "hover:bg-secondary/80 border border-border",
        ],
        ghost: [
          "text-muted-foreground",
          "hover:text-foreground hover:bg-muted",
        ],
        link: ["text-primary underline-offset-4 hover:underline"],
        glow: [
          "bg-primary text-primary-foreground",
          "shadow-[0_0_20px_hsl(var(--primary)/0.5)]",
          "hover:shadow-[0_0_30px_hsl(var(--primary)/0.7)]",
          "animate-pulse-glow",
        ],
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 px-3 text-xs",
        lg: "h-11 px-6",
        icon: "h-10 w-10 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

type ButtonProps<T extends ValidComponent = "button"> =
  ButtonPrimitive.ButtonRootProps<T> &
    VariantProps<typeof buttonVariants> & {
      class?: string | undefined;
      children?: JSX.Element;
    };

const Button = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ButtonProps<T>>
) => {
  const [local, others] = splitProps(props as ButtonProps, [
    "variant",
    "size",
    "class",
  ]);
  return (
    <ButtonPrimitive.Root
      class={cn(
        buttonVariants({ variant: local.variant, size: local.size }),
        local.class
      )}
      {...others}
    />
  );
};

export { Button, buttonVariants };
export type { ButtonProps };
