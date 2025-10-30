import React from "react";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "error"};

export function Button({ variant = "primary", className = "", ...props }: Props) {
  const base = "btn " + (variant === "primary" ? "btn-primary" : "btn-ghost");
  return <button {...props} className={base + " " + className} />;
}
