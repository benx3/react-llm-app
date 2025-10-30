import React from "react";

export function Card({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={"card " + className}>{children}</div>;
}

export function CardContent({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={"p-4 " + className}>{children}</div>;
}

export function CardHeader({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <div className={"p-4 border-b " + className}>{children}</div>;
}

export function CardTitle({ children, className = "" }: React.PropsWithChildren<{ className?: string }>) {
  return <h3 className={"font-semibold " + className}>{children}</h3>;
}
