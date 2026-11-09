/** One activity POST doubles as a heartbeat; keystrokes never produce per-key network writes. */
export function activityPost(now: number, lastPost: number, lastTyping: boolean, typedAt: number): { due: boolean; typing: boolean } {
  const typing = typedAt > 0 && now - typedAt >= 0 && now - typedAt <= 5000
  return { typing, due: now - lastPost >= 20000 || (now - lastPost >= 5000 && (typing || lastTyping)) }
}
