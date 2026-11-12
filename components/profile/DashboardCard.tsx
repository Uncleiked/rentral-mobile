interface DashboardCardProps {
  id?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardCard({ id, title, action, children }: DashboardCardProps) {
  return (
    <div id={id} className="bg-surface-card border border-border-subtle rounded-2xl p-6 flex flex-col gap-4 scroll-mt-6 min-w-0 max-w-full wrap-anywhere text-text-primary">
      <div className="flex items-center justify-between min-w-0 flex-wrap gap-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted break-words">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
