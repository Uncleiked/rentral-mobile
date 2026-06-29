import clsx from "clsx";
import Image from "next/image";

const suggestions = [
  { id: 1, username: "lux_rentals", description: "Suggested for you", avatar: "https://i.pravatar.cc/150?u=a04258" },
  { id: 2, username: "auto_prestige", description: "Followed by david + 2 more", avatar: "https://i.pravatar.cc/150?u=a04259" },
  { id: 3, username: "yacht_club", description: "Suggested for you", avatar: "https://i.pravatar.cc/150?u=a04260" },
  { id: 4, username: "realestate_king", description: "Suggested for you", avatar: "https://i.pravatar.cc/150?u=a04261" },
  { id: 5, username: "sarah_properties", description: "Suggested for you", avatar: "https://i.pravatar.cc/150?u=a04262" },
];

export function MarketplaceSuggestions() {
  return (
    <aside className={clsx(
      'hidden lg:block', 
      'w-[319px]', 
      'pt-10 pr-8', 
      'bg-background-app'
    )}>
      {/* Current User */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="relative h-11 w-11 rounded-full overflow-hidden border border-glass-border-medium">
            <Image src="https://i.pravatar.cc/150?u=current_user" alt="Me" fill className="object-cover" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-text-primary">david_ikediashi</span>
            <span className="text-sm text-text-muted">David Ikediashi</span>
          </div>
        </div>
        <button className="text-xs font-bold text-[#0095f6] hover:text-white transition-colors">Switch</button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-bold text-text-muted">Suggested for you</span>
        <button className="text-xs font-bold text-text-primary hover:text-text-muted transition-colors">See All</button>
      </div>

      <div className="flex flex-col gap-4">
        {suggestions.map(user => (
          <div key={user.id} className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative h-11 w-11 rounded-full overflow-hidden border border-glass-border-medium">
                <Image src={user.avatar} alt={user.username} fill className="object-cover" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm font-bold text-text-primary">{user.username}</span>
                <span className="text-xs text-text-muted">{user.description}</span>
              </div>
            </div>
            <button className="text-xs font-bold text-[#0095f6] hover:text-white transition-colors">Follow</button>
          </div>
        ))}
      </div>

      <div className="mt-10 text-xs text-text-muted flex flex-wrap gap-x-2 gap-y-1">
        <a href="#" className="hover:underline">About</a> · 
        <a href="#" className="hover:underline">Help</a> · 
        <a href="#" className="hover:underline">Press</a> · 
        <a href="#" className="hover:underline">API</a> · 
        <a href="#" className="hover:underline">Jobs</a> · 
        <a href="#" className="hover:underline">Privacy</a> · 
        <a href="#" className="hover:underline">Terms</a>
      </div>
      <div className="mt-4 text-xs text-text-muted uppercase">
        © 2026 Rentral
      </div>
    </aside>
  );
}
