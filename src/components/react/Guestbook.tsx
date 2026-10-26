import { useCallback, useEffect, useRef, useState } from "react";
import { SignaturePad } from "./signature-pad";
import { signIn, signOut } from "auth-astro/client";
import { ArrowUpRight, Check, LogIn, PenLine, X } from "lucide-react";

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
  const [loadError, setLoadError] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  const loadEntries = useCallback(async () => {
    const response = await fetch("/api/guestbook", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Could not load the guestbook");
    }
    setEntries(await response.json());
    setLoadError(false);
  }, []);

  const hasSigned =
    session?.user?.id && entries
      ? entries.some(
          (entry) => "githubId" in entry && entry.githubId === session.user!.id,
        )
      : false;

  useEffect(() => {
    loadEntries().catch(() => setLoadError(true));
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

  useEffect(() => {
    if (!showModal) return;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    dialog?.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog?.close();
      document.body.style.overflow = overflow;
    };
  }, [showModal]);

  return (
    <div className="guestbook">
      <header className="guestbook-header">
        <div className="guestbook-heading">
          <h1>Guestbook<span>.</span></h1>
          <p>Say hello</p>
        </div>
        <div className="guestbook-invitation">
          {sessionLoading ? (
            <span className="guestbook-auth-loading" aria-label="Checking sign-in status" />
          ) : session?.user ? (
            hasSigned ? (
              <p className="guestbook-signed"><Check size={15} aria-hidden="true" /> You’ve left your mark. Thank you.</p>
            ) : (
              <button type="button" onClick={() => setShowModal(true)} className="guestbook-action">
                <PenLine size={14} strokeWidth={1.75} aria-hidden="true" /> Leave a note
              </button>
            )
          ) : (
            <button type="button" onClick={() => signIn("github")} className="guestbook-action">
              <LogIn size={15} strokeWidth={1.7} aria-hidden="true" /> Sign in with GitHub <ArrowUpRight size={13} aria-hidden="true" />
            </button>
          )}
          {session?.user ? (
            <div className="guestbook-account">
              <span>Signed in as {session.user.name}</span><span aria-hidden="true">·</span>
              <button type="button" onClick={() => signOut()}>Sign out</button>
            </div>
          ) : null}
        </div>
      </header>

      <section aria-labelledby="guestbook-notes-heading" aria-busy={entries === null && !loadError}>
        <div className="guestbook-notes-heading">
          <h2 id="guestbook-notes-heading">Notes from visitors</h2>
          {import.meta.env.DEV && entries?.some(entry => entry._id.startsWith("local-guestbook-")) ? (
            <span className="guestbook-preview">Local sample notes</span>
          ) : <span>Newest first</span>}
        </div>
        {loadError ? (
          <div className="guestbook-empty" role="alert">
            <p>The guestbook couldn’t load. Let’s try that again.</p>
            <button type="button" onClick={() => {
              setLoadError(false);
              void loadEntries().catch(() => setLoadError(true));
            }}>Try again <ArrowUpRight size={13} aria-hidden="true" /></button>
          </div>
        ) : entries === null ? (
          <div className="guestbook-grid">
            <p className="sr-only" role="status">Loading the guestbook…</p>
            {[0, 1, 2, 3].map(index => <div key={index} className="guestbook-placeholder" aria-hidden="true"><span /><span /><span /></div>)}
          </div>
        ) : entries.length === 0 ? (
          <div className="guestbook-empty">
            <PenLine size={24} strokeWidth={1.2} aria-hidden="true" />
            <p>A fresh page, waiting for a first hello.</p>
            <span>Your note could be the start of something nice.</span>
          </div>
        ) : (
          <div className="guestbook-grid">
            {entries.map(entry => (
              <article key={entry._id} className="guestbook-entry">
                <header className="guestbook-entry-author">
                  <span className="guestbook-avatar" aria-hidden="true">
                    {entry.authorImage ? <img src={entry.authorImage} alt="" width="32" height="32" loading="lazy" />
                      : entry.authorName.split(/\s+/).slice(0, 2).map(part => part[0]).join("")}
                  </span>
                  <div>
                    <h3>{entry.authorName}</h3>
                  </div>
                </header>
                <blockquote>{entry.message}</blockquote>
                <div className="guestbook-entry-bottom">
                  {entry.signature ? <img src={entry.signature} alt={`${entry.authorName}’s signature`} className="guestbook-signature" loading="lazy" /> : null}
                  <time dateTime={new Date(entry.createdAt).toISOString()}>{formatDate(entry.createdAt)}</time>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <dialog ref={dialogRef} className="guestbook-dialog" aria-labelledby="signature-heading"
        onCancel={() => setShowModal(false)} onClose={() => setShowModal(false)}
        onClick={event => {
          if (event.target !== event.currentTarget) return;
          const bounds = event.currentTarget.getBoundingClientRect();
          if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) setShowModal(false);
        }}>
        {showModal ? <form onSubmit={event => { event.preventDefault(); void handleSubmit(); }}>
          <button type="button" className="guestbook-dialog-close" aria-label="Close signing form" onClick={() => setShowModal(false)}><X size={18} aria-hidden="true" /></button>
          <p className="guestbook-dialog-eyebrow">A SMALL HELLO GOES A LONG WAY</p>
          <h2 id="signature-heading">Leave your mark<span>.</span></h2>
          <p className="guestbook-dialog-description">A few words, and a little piece of you.</p>
          <label htmlFor="guestbook-message">Your note</label>
          <textarea id="guestbook-message" value={message} onChange={event => setMessage(event.target.value)}
            placeholder="Say hello, share a thought, or tell me what brought you here…" rows={3} required autoFocus />
          <div className="guestbook-signature-heading"><p id="signature-label">Your signature</p><span>Make it yours.</span></div>
          <SignaturePad aria-labelledby="signature-label" className="guestbook-signature-pad" onChange={setSignature} />
          {error ? <p role="alert" className="guestbook-form-error">{error}</p> : null}
          <div className="guestbook-form-actions">
            <button type="button" className="guestbook-cancel" onClick={() => setShowModal(false)}>Maybe later</button>
            <button type="submit" className="guestbook-action" disabled={submitting || !message.trim() || !signature}>
              {submitting ? "Leaving your mark…" : "Sign guestbook"}<PenLine size={13} aria-hidden="true" />
            </button>
          </div>
        </form> : null}
      </dialog>
    </div>
  );
}
