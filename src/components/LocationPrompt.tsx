"use client";

export type LocationState = "pending" | "granted" | "denied" | "unavailable" | "unsupported";

const MESSAGES: Record<Exclude<LocationState, "pending" | "granted">, { title: string; body: string }> = {
  denied: {
    title: "Location is blocked",
    body: "Showing all of India instead of your area. To see what is happening around you, allow location for this site in your browser settings, then reload.",
  },
  unavailable: {
    title: "Could not get your location",
    body: "Showing all of India instead. Turn on Location Services on your device, then try again.",
  },
  unsupported: {
    title: "This browser cannot share location",
    body: "Showing all of India. You can still browse the map and report incidents by entering coordinates manually.",
  },
};

/**
 * Says out loud that the map is showing the country rather than the viewer's
 * surroundings, and why.
 *
 * The previous behaviour was to fall back silently, which looks identical to
 * the map being broken — the viewer has no way to tell "nothing is near you"
 * apart from "we never found out where you are".
 */
export default function LocationPrompt({
  state,
  onRetry,
}: {
  state: LocationState;
  onRetry: () => void;
}) {
  if (state === "pending" || state === "granted") return null;
  const message = MESSAGES[state];

  return (
    <div className="pointer-events-auto w-full rounded-xl bg-amber-50 p-3 shadow-lg ring-1 ring-amber-300 sm:max-w-xs">
      <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
        <span aria-hidden>📍</span>
        {message.title}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-amber-800">{message.body}</p>
      {state !== "unsupported" ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-800"
        >
          Try again
        </button>
      ) : null}
    </div>
  );
}
