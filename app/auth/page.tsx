'use client';
/* oxlint-disable next/no-html-link-for-pages -- Native navigation avoids the deployed Vinext router failure and reloads the game with the persisted pilot session. */
import { useEffect, useState, type SubmitEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Plane, ArrowLeft, Mail, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { browserAuth } from '@/lib/supabase/client';
import './auth.css';

type View = 'signin' | 'signup' | 'forgot' | 'reset';
export default function PilotAccount() {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [view, setView] = useState<View>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [account, setAccount] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;
    const params = new URLSearchParams(window.location.search);
    const recovery = params.get('view') === 'reset';
    const authError =
      params.get('error_description') ??
      new URLSearchParams(window.location.hash.slice(1)).get(
        'error_description',
      );
    void browserAuth()
      .then(async (auth) => {
        if (cancelled) return;
        if (recovery) setView('reset');
        if (authError)
          setError(
            'That email link is invalid or expired. Request a new link below.',
          );
        setClient(auth);
        const { data: subscription } = auth.auth.onAuthStateChange(
          (event, session) => {
            if (cancelled) return;
            setAccount(session?.user.email ?? null);
            if (event === 'PASSWORD_RECOVERY') setView('reset');
          },
        );
        unsubscribe = () => subscription.subscription.unsubscribe();
        const { data, error: sessionError } = await auth.auth.getSession();
        if (cancelled) return;
        if (sessionError)
          setError(
            'That sign-in link could not be opened. Request a new email and open it in this browser.',
          );
        setAccount(data.session?.user.email ?? null);
        if (params.has('code') || authError)
          window.history.replaceState(
            {},
            '',
            recovery ? '/auth?view=reset' : '/auth',
          );
      })
      .catch((reason: unknown) => {
        if (!cancelled)
          setError(
            reason instanceof Error
              ? reason.message
              : 'Accounts are temporarily unavailable.',
          );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);
  function changeView(next: View) {
    setView(next);
    setError('');
    setMessage('');
    setPassword('');
    setConfirmation('');
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client || busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      if ((view === 'signup' || view === 'reset') && password !== confirmation)
        throw new Error('The passwords do not match.');
      if (view === 'signin') {
        const { error: failure } = await client.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (failure) throw failure;
        window.location.assign('/');
      } else if (view === 'signup') {
        const { data, error: failure } = await client.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (failure) throw failure;
        setPassword('');
        setConfirmation('');
        if (data.session) window.location.assign('/');
        else
          setMessage(
            'Check your email for a confirmation link. Open it in this browser, then return to the county. If you already have an account, sign in instead.',
          );
      } else if (view === 'forgot') {
        const { error: failure } = await client.auth.resetPasswordForEmail(
          email.trim(),
          { redirectTo: `${window.location.origin}/auth?view=reset` },
        );
        if (failure) throw failure;
        setMessage(
          'If an account exists for that email, a reset link is on its way. Open it in this browser.',
        );
      } else {
        const { error: failure } = await client.auth.updateUser({ password });
        if (failure) throw failure;
        setPassword('');
        setConfirmation('');
        setView('signin');
        setMessage('Password updated. You can return to the county.');
      }
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : 'Please try again shortly.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function signOut() {
    if (!client) return;
    setBusy(true);
    setError('');
    const { error: failure } = await client.auth.signOut({ scope: 'local' });
    if (failure) setError('Sign-out failed. Please try again.');
    else {
      setAccount(null);
      changeView('signin');
    }
    setBusy(false);
  }
  const signedIn = account && view !== 'reset';
  return (
    <main className="pilot-auth">
      <a href="/" className="auth-back">
        <ArrowLeft size={18} /> Back to the county
      </a>
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand">
          <Plane size={28} />
          <span>PRAIRIE AIR</span>
        </div>
        <span className="auth-kicker">YOUR PILOT ACCOUNT</span>
        <h1 id="auth-title">
          {signedIn
            ? 'Ready for the next pass.'
            : view === 'forgot'
              ? 'Get back in the sky.'
              : view === 'reset'
                ? 'Choose a new password.'
                : 'The county is waiting.'}
        </h1>
        <p className="auth-intro">
          {signedIn
            ? `Signed in as ${account}`
            : 'Save your aircraft upgrades, claim seasonal contracts, and earn your place on the leaderboard.'}
        </p>
        {loading ? (
          <output>Opening your account…</output>
        ) : signedIn ? (
          <div className="auth-actions">
            <a className="auth-primary-link" href="/">
              Return to the county <Plane size={18} />
            </a>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        ) : (
          <>
            {(view === 'signin' || view === 'signup') && (
              <Tabs
                value={view}
                onValueChange={(value) => changeView(value as View)}
              >
                <TabsList className="auth-tabs">
                  <TabsTrigger value="signin">Sign in</TabsTrigger>
                  <TabsTrigger value="signup">Create account</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            {view === 'reset' && !account ? (
              <div className="auth-message">
                <p>
                  Open the reset link from your email to choose a new password.
                </p>
                <Button variant="outline" onClick={() => changeView('forgot')}>
                  Request a new link
                </Button>
              </div>
            ) : (
              <form onSubmit={(event) => void submit(event)}>
                {view !== 'reset' && (
                  <label htmlFor="pilot-email">
                    Email
                    <Input
                      id="pilot-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      maxLength={254}
                      disabled={busy || !client}
                    />
                  </label>
                )}
                {view !== 'forgot' && (
                  <label htmlFor="pilot-password">
                    {view === 'reset' ? 'New password' : 'Password'}
                    <Input
                      id="pilot-password"
                      name="password"
                      type="password"
                      autoComplete={
                        view === 'signin' ? 'current-password' : 'new-password'
                      }
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      minLength={view === 'signin' ? 1 : 10}
                      maxLength={128}
                      required
                      disabled={busy || !client}
                    />
                    {view !== 'signin' && (
                      <small>Use at least 10 characters.</small>
                    )}
                  </label>
                )}
                {(view === 'signup' || view === 'reset') && (
                  <label htmlFor="pilot-confirm">
                    Confirm password
                    <Input
                      id="pilot-confirm"
                      name="confirm-password"
                      type="password"
                      autoComplete="new-password"
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                      required
                      maxLength={128}
                      disabled={busy || !client}
                    />
                  </label>
                )}
                <Button
                  className="auth-submit"
                  type="submit"
                  disabled={busy || !client}
                >
                  {busy
                    ? 'Please wait…'
                    : view === 'signup'
                      ? 'Create pilot account'
                      : view === 'forgot'
                        ? 'Send reset link'
                        : view === 'reset'
                          ? 'Save new password'
                          : 'Sign in and fly'}
                </Button>
              </form>
            )}
            <div className="auth-links">
              {view === 'signin' ? (
                <button onClick={() => changeView('forgot')}>
                  Forgot your password?
                </button>
              ) : (
                <button onClick={() => changeView('signin')}>
                  Back to sign in
                </button>
              )}
            </div>
          </>
        )}
        {error && (
          <p className="auth-error" role="alert">
            {error}
          </p>
        )}
        {message && (
          <output className="auth-message">
            <Mail size={19} />
            {message}
          </output>
        )}
        <p className="auth-privacy">
          <ShieldCheck size={16} /> Other pilots see your callsign, never your
          email.
        </p>
      </section>
    </main>
  );
}
