import clsx from "clsx";

export default function Loading() {
  return (
    <div className={clsx('flex', 'min-h-[100dvh]', 'w-full', 'items-center', 'justify-center', 'bg-background-app')}>
      <div className={clsx('flex', 'flex-col', 'items-center', 'gap-4')}>
        <div className={clsx('relative', 'flex', 'h-16', 'w-16', 'items-center', 'justify-center')}>
          <div className={clsx('absolute', 'inset-0', 'animate-ping', 'rounded-full', 'bg-accent-warm/20')} />
          <svg viewBox="0 0 24 24" className={clsx('relative', 'z-10', 'h-8', 'w-8', 'animate-pulse', 'text-accent-warm')} fill="currentColor">
            <path d="M12 2L14.8 9.2L22 12L14.8 14.8L12 22L9.2 14.8L2 12L9.2 9.2L12 2Z" />
          </svg>
        </div>
        <p className={clsx('text-xs', 'font-bold', 'uppercase', 'tracking-[0.2em]', 'text-text-muted', 'animate-pulse')}>
          Loading
        </p>
      </div>
    </div>
  );
}
