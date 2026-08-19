import { useCallback, useEffect, useState } from "react";
import { SignaturePad } from "./signature-pad";
import { signIn, signOut } from "auth-astro/client";
import { LogIn, Pen } from "lucide-react";

interface Session {
  user?: {
    id?: string | null;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

interface GuestbookEntry {
  _id: string;
  _creationTime: number;
  message: string;
  authorName: string;
  githubUsername?: string;
  githubId?: string;
  authorImage?: string;
  signature: string;
  createdAt: number;
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

export default function Guestbook() {
  const [entries, setEntries] = useState<GuestbookEntry[] | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadEntries = useCallback(async () => {
    const response = await fetch("/api/guestbook", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load the guestbook");
    }
    setEntries(await response.json());
  }, []);

  const hasSigned =
    session?.user?.id && entries
      ? entries.some(
          (entry) => "githubId" in entry && entry.githubId === session.user!.id,
        )
      : false;

  useEffect(() => {
    loadEntries().catch(() => setEntries([]));
  }, [loadEntries]);

  useEffect(() => {
    fetch("/api/auth/session")
      .then((res) => res.json())
      .then((data) => {
        setSession(data && data.user ? data : null);
        setSessionLoading(false);
      })
      .catch(() => setSessionLoading(false));
  }, []);

  const handleSubmit = async () => {
    if (!message.trim() || !signature) {
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/guestbook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: message.trim(), signature }),
      });

      if (res.ok) {
        await loadEntries();
        setShowModal(false);
        setMessage("");
        setSignature(null);
        setError(null);
      } else {
        const data = await res.json();
        setError(data.error || "Something went wrong. Please try again.");
      }
    } catch (err) {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <header className="mb-10 pb-8 border-b border-hairline">
        <h1 className="font-serif text-[clamp(1.75rem,5vw,2.25rem)] font-medium text-off-white tracking-tight mb-6">
          Guestbook
        </h1>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {sessionLoading ? null : session?.user ? (
            hasSigned ? (
              <p className="text-sm text-muted">You&apos;ve signed.</p>
            ) : (
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm text-off-white border border-hairline hover:border-accent/50 hover:text-accent transition-colors w-fit"
              >
                <Pen size={14} strokeWidth={1.75} />
                Sign guestbook
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => signIn("github")}
              className="flex items-center gap-2 px-4 py-2.5 text-sm text-off-white border border-hairline hover:border-accent/50 hover:text-accent transition-colors w-fit"
            >
              <LogIn size={14} strokeWidth={1.75} />
              Sign in with GitHub
            </button>
          )}
        </div>
        {session?.user && (
          <div className="flex flex-wrap items-center gap-2 mt-6 pt-6 border-t border-hairline text-xs text-muted">
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                className="w-5 h-5 rounded-full opacity-90"
              />
            )}
            <span>Signed in as {session.user.name}</span>
            <span className="text-muted-faint">·</span>
            <button
              type="button"
              onClick={() => signOut()}
              className="text-muted-faint hover:text-accent transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {entries === null ? (
          <p className="col-span-full text-sm text-muted">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="col-span-full text-sm text-muted leading-relaxed max-w-md">
            No entries yet. Be the first to sign.
          </p>
        ) : (
          entries.map((entry) => (
            <figure
              key={entry._id}
              className="border-l-2 border-hairline hover:border-accent/45 pl-5 py-1 transition-colors"
            >
              <blockquote className="text-off-white text-sm leading-relaxed">
                {entry.message}
              </blockquote>
              {entry.signature ? (
                <img
                  src={entry.signature}
                  alt={`${entry.authorName}'s signature`}
                  className="w-full h-auto mt-4 opacity-90"
                />
              ) : null}
              <figcaption className="mt-5 pt-4 border-t border-hairline">
                <cite className="font-serif text-sm text-off-white not-italic">
                  {entry.authorName}
                </cite>
                <p className="text-2xs uppercase tracking-[0.12em] text-muted-faint mt-1.5">
                  {formatDate(entry.createdAt)}
                </p>
              </figcaption>
            </figure>
          ))
        )}
      </div>

      {showModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="absolute inset-0 bg-black/80 cursor-default border-0 w-full h-full"
            onClick={() => setShowModal(false)}
            aria-label="Close"
          />
          <div className="relative bg-black-001 border border-hairline border-l-accent/25 p-6 sm:p-8 w-full max-w-lg">
            <h2 className="font-serif text-xl text-off-white mb-2">
              New signature
            </h2>
            <p className="text-sm text-muted mb-6">
              Add a short note, then sign in the box.
            </p>

            <label className="block text-2xs uppercase tracking-[0.14em] text-muted-faint mb-2">
              Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Write something…"
              rows={3}
              className="w-full bg-transparent border border-hairline rounded-sm p-3 text-off-white text-sm placeholder-muted-faint min-h-32 resize-y focus:outline-none focus:border-accent/35 mb-5"
            />

            <label className="block text-2xs uppercase tracking-[0.14em] text-muted-faint mb-2">
              Signature
            </label>
            <SignaturePad
              className="h-[140px] w-full rounded-sm border border-hairline mb-5"
              onChange={setSignature}
            />

            {error ? <p className="text-red-400 text-sm mb-4">{error}</p> : null}

            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="px-3 py-2 text-sm text-muted hover:text-off-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={submitting || !message.trim() || !signature}
                className="px-4 py-2 text-sm font-medium text-black-001 bg-accent hover:bg-off-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? "Signing…" : "Sign"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
