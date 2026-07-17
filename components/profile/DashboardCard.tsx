interface DashboardCardProps {
  id?: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}

export function DashboardCard({ id, title, action, children }: DashboardCardProps) {
  return (
    <div id={id} className="bg-surface-card border border-border-subtle rounded-2xl p-6 flex flex-col gap-4 scroll-mt-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-wider text-text-muted">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}
