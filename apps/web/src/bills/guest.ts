// A friend who joins a bill gets a guest token (it lasts 24 hours). It is kept on
// their phone, one per bill, so a refresh doesn't ask for their name again.

export type Guest = { token: string; participantId: string };

const key = (shareToken: string) => `splitlah.guest.${shareToken}`;

export const guestStore = {
  get(shareToken: string): Guest | null {
    const saved = localStorage.getItem(key(shareToken));
    return saved ? (JSON.parse(saved) as Guest) : null;
  },
  set: (shareToken: string, guest: Guest) =>
    localStorage.setItem(key(shareToken), JSON.stringify(guest)),
  clear: (shareToken: string) => localStorage.removeItem(key(shareToken)),
};
