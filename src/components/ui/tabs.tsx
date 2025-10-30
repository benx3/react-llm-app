import React, { useId } from "react";

type Tab = { id: string; label: string };
type Props = { tabs: Tab[]; value: string; onChange: (id: string) => void; className?: string; };

export function Tabs({ tabs, value, onChange, className = "" }: Props) {
  const group = useId();
  return (
    <div className={"w-full " + className}>
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-700">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={
              "px-3 py-2 rounded-t-xl text-sm " +
              (value === t.id
                ? "bg-white dark:bg-slate-800 border border-b-0 border-slate-200 dark:border-slate-700"
                : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800")
            }
            aria-selected={value === t.id}
            role="tab"
            aria-controls={`${group}-${t.id}`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function TabPanel({ id, active, children }: React.PropsWithChildren<{ id: string; active: boolean }>) {
  return (
    <div
      id={id}
      role="tabpanel"
      hidden={!active}
      className="p-4 border border-t-0 border-slate-200 dark:border-slate-700 rounded-b-xl bg-white dark:bg-slate-800"
    >
      {children}
    </div>
  );
}
