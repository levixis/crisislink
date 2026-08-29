"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  DISASTER_EMOJI,
  DISASTER_LABELS,
  DISASTER_TYPES,
  HELP_OPTIONS,
  SEVERITY_LABELS,
  type DisasterTypeValue,
} from "@/lib/constants";

type Position = { lat: number; lng: number; accuracy: number | null };
type LocationState =
  | { status: "locating" }
  | { status: "ready"; position: Position; manual: boolean }
  | { status: "error"; message: string };

export default function ReportForm() {
  const router = useRouter();
  const [disasterType, setDisasterType] = useState<DisasterTypeValue | null>(null);
  const [severity, setSeverity] = useState(3);
  const [description, setDescription] = useState("");
  const [peopleInDanger, setPeopleInDanger] = useState(0);
  const [helpNeeded, setHelpNeeded] = useState<string[]>([]);
  const [location, setLocation] = useState<LocationState>({ status: "locating" });
  const [manualEntry, setManualEntry] = useState(false);
  const [manualCoords, setManualCoords] = useState({ lat: "", lng: "" });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Registers the geolocation callbacks and returns immediately. Every state
  // change happens in a callback, never synchronously, so this is safe to call
  // straight from an effect. A device without geolocation support, or an
  // insecure origin, surfaces through the same error callback as a denial.
  const requestPosition = useCallback(() => {
    navigator.geolocation.getCurrentPosition(
      ({ coords }) =>
        setLocation({
          status: "ready",
          manual: false,
          position: { lat: coords.latitude, lng: coords.longitude, accuracy: coords.accuracy },
        }),
      (cause) =>
        setLocation({
          status: "error",
          message:
            cause.code === cause.PERMISSION_DENIED
              ? "Location permission was denied. Allow it, or enter coordinates manually below."
              : "Could not get a GPS fix. Try again, or enter coordinates manually below.",
        }),
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }, []);

  useEffect(() => requestPosition(), [requestPosition]);

  const retryLocate = () => {
    setLocation({ status: "locating" });
    requestPosition();
  };

  const toggleHelp = (option: string) =>
    setHelpNeeded((current) =>
      current.includes(option) ? current.filter((h) => h !== option) : [...current, option],
    );

  const applyManualCoords = () => {
    const lat = Number(manualCoords.lat);
    const lng = Number(manualCoords.lng);
    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setError("Latitude must be between -90 and 90.");
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setError("Longitude must be between -180 and 180.");
      return;
    }
    setError(null);
    setLocation({ status: "ready", manual: true, position: { lat, lng, accuracy: null } });
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (!disasterType) return setError("Choose what kind of incident this is.");
    if (description.trim().length < 10)
      return setError("Add at least a sentence describing what you can see.");
    if (location.status !== "ready") return setError("A location is required before submitting.");

    setSubmitting(true);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          disasterType,
          severity,
          description: description.trim(),
          peopleInDanger,
          helpNeeded,
          mediaUrls: [],
          lat: location.position.lat,
          lng: location.position.lng,
          accuracy: location.position.accuracy,
          clientCreatedAt: new Date().toISOString(),
        }),
      });

      if (response.status === 401) {
        router.push("/login?next=/report");
        return;
      }
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Could not submit the report.");

      router.push("/?submitted=1");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit the report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">What is happening?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DISASTER_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setDisasterType(type)}
              aria-pressed={disasterType === type}
              className={`rounded-lg border p-3 text-center text-xs font-medium transition ${
                disasterType === type
                  ? "border-red-600 bg-red-50 text-red-900 ring-2 ring-red-200"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              <span aria-hidden className="block text-xl">{DISASTER_EMOJI[type]}</span>
              <span className="mt-1 block">{DISASTER_LABELS[type]}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <div>
        <label htmlFor="severity" className="block text-sm font-semibold text-slate-900">
          How bad is it? <span className="font-normal text-slate-600">{SEVERITY_LABELS[severity]}</span>
        </label>
        <input
          id="severity"
          type="range"
          min={1}
          max={5}
          step={1}
          value={severity}
          onChange={(e) => setSeverity(Number(e.target.value))}
          className="mt-2 w-full accent-red-700"
        />
        <div className="flex justify-between text-[11px] text-slate-500">
          <span>Minor</span>
          <span>Catastrophic</span>
        </div>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-semibold text-slate-900">
          What can you see?
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder="Water is about knee deep across the main road and rising. Two cars are stuck."
          className="mt-2 w-full rounded-lg border border-slate-300 p-3 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
        />
        <p className="mt-1 text-xs text-slate-500">{description.length}/2000</p>
      </div>

      <div>
        <label htmlFor="people" className="block text-sm font-semibold text-slate-900">
          People in immediate danger
        </label>
        <input
          id="people"
          type="number"
          min={0}
          max={100000}
          inputMode="numeric"
          value={peopleInDanger}
          onChange={(e) => setPeopleInDanger(Math.max(0, Number(e.target.value) || 0))}
          className="mt-2 w-28 rounded-lg border border-slate-300 p-2 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
        />
      </div>

      <fieldset>
        <legend className="text-sm font-semibold text-slate-900">Help needed</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {HELP_OPTIONS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => toggleHelp(option)}
              aria-pressed={helpNeeded.includes(option)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                helpNeeded.includes(option)
                  ? "border-red-600 bg-red-50 text-red-900"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {option}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-sm font-semibold text-slate-900">Location</p>
        {location.status === "locating" ? (
          <p className="mt-1 text-sm text-slate-600">Getting a GPS fix…</p>
        ) : null}
        {location.status === "ready" ? (
          <p className="mt-1 text-sm text-slate-600">
            {location.position.lat.toFixed(5)}, {location.position.lng.toFixed(5)}
            {location.position.accuracy
              ? ` · accurate to about ${Math.round(location.position.accuracy)} m`
              : location.manual
                ? " · entered manually"
                : ""}
          </p>
        ) : null}
        {location.status === "error" ? (
          <p className="mt-1 text-sm text-red-700">{location.message}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap gap-3 text-xs">
          <button type="button" onClick={retryLocate} className="font-medium text-blue-700 underline">
            Use my GPS location
          </button>
          <button
            type="button"
            onClick={() => setManualEntry((v) => !v)}
            className="font-medium text-blue-700 underline"
          >
            {manualEntry ? "Hide manual entry" : "Enter coordinates manually"}
          </button>
        </div>

        {manualEntry ? (
          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="text-xs text-slate-600">
              Latitude
              <input
                value={manualCoords.lat}
                onChange={(e) => setManualCoords((c) => ({ ...c, lat: e.target.value }))}
                inputMode="decimal"
                placeholder="19.0760"
                className="mt-1 block w-32 rounded border border-slate-300 p-2 text-sm"
              />
            </label>
            <label className="text-xs text-slate-600">
              Longitude
              <input
                value={manualCoords.lng}
                onChange={(e) => setManualCoords((c) => ({ ...c, lng: e.target.value }))}
                inputMode="decimal"
                placeholder="72.8777"
                className="mt-1 block w-32 rounded border border-slate-300 p-2 text-sm"
              />
            </label>
            <button
              type="button"
              onClick={applyManualCoords}
              className="rounded-md border border-slate-300 px-3 py-2 text-xs font-medium hover:bg-slate-50"
            >
              Use these
            </button>
            <p className="w-full text-xs text-slate-500">
              Must be a location in India.
            </p>
          </div>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-red-700 px-4 py-3 text-base font-semibold text-white shadow hover:bg-red-800 disabled:opacity-60"
      >
        {submitting ? "Submitting…" : "Submit report"}
      </button>
      <p className="text-center text-xs text-slate-500">
        False reports waste responder time and are logged against your account.
      </p>
    </form>
  );
}
