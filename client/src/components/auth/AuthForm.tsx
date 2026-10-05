import { useState, type FormEvent } from 'react'
import FormField from '@/components/ui/FormField'
import { useAuth } from '@/hooks/useAuth'
import { ApiRequestError } from '@/services/http'
import type { PublicUser } from '@/types/auth'

/*
 * Sign-in and registration, one component.
 *
 * Used by /login, /register and the Submit page's inline gate, so the three
 * can never drift apart. Visual language is the Submit form's own: FormField
 * controls, the pink alert banner, the gradient CTA.
 *
 * Errors come from the server in its usual shape and land where a person can
 * act on them:
 *   400 VALIDATION_FAILED  → per-field messages
 *   409 EMAIL_TAKEN        → on the email field
 *   401                    → "Email or password is incorrect." (banner)
 *   429                    → banner with the retry time
 *   503 AUTH_UNAVAILABLE   → banner: accounts are unavailable
 *   network / 500          → banner
 *
 * The confirmation field is checked here only — the server never sees it.
 */

export type AuthMode = 'login' | 'register'

interface AuthFormProps {
  mode: AuthMode
  onModeChange: (mode: AuthMode) => void
  onSuccess: (user: PublicUser) => void
  /** Swaps the mode toggle for links when false (the /login and /register pages use links). */
  inlineToggle?: boolean
}

const BUTTON_CLASSES =
  'inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-pill border border-white/[0.16] bg-[image:var(--gradient-cta)] px-6 py-[13px] text-[14.5px] font-semibold text-white shadow-button transition-[transform,box-shadow,opacity] duration-300 ease-[cubic-bezier(.2,.8,.2,1)] hover:shadow-button-hover disabled:cursor-not-allowed disabled:opacity-40'

function messageFor(error: unknown): { fields: Record<string, string>; banner?: string } {
  if (!(error instanceof ApiRequestError)) {
    return { fields: {}, banner: 'Something went wrong. Check your connection and try again.' }
  }
  switch (error.code) {
    case 'VALIDATION_FAILED':
    case 'EMAIL_TAKEN':
      return { fields: error.fields ?? {}, banner: error.fields ? undefined : error.message }
    case 'RATE_LIMITED': {
      const minutes = error.retryAfterSeconds ? Math.max(1, Math.ceil(error.retryAfterSeconds / 60)) : undefined
      return {
        fields: {},
        banner: minutes
          ? `Too many attempts. Try again in about ${minutes} minute${minutes === 1 ? '' : 's'}.`
          : error.message,
      }
    }
    case 'AUTH_UNAVAILABLE':
      return { fields: {}, banner: 'Accounts are temporarily unavailable. Please try again later.' }
    default:
      // UNAUTHENTICATED carries the server's deliberately vague credentials message.
      return { fields: {}, banner: error.message }
  }
}

export default function AuthForm({ mode, onModeChange, onSuccess, inlineToggle = true }: AuthFormProps) {
  const { login, register } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fields, setFields] = useState<Record<string, string>>({})
  const [banner, setBanner] = useState<string | undefined>(undefined)
  const [pending, setPending] = useState(false)

  const registering = mode === 'register'

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    // The gate renders inside the Submit page's <form>; never let this
    // submit bubble into it.
    event.preventDefault()
    event.stopPropagation()
    if (pending) return
    if (registering && password !== confirm) {
      setFields({ confirm: 'The passwords don’t match.' })
      setBanner(undefined)
      return
    }
    setPending(true)
    setFields({})
    setBanner(undefined)
    try {
      const user = registering
        ? await register({ email, password, ...(name.trim() ? { name: name.trim() } : {}) })
        : await login({ email, password })
      onSuccess(user)
    } catch (error) {
      const message = messageFor(error)
      setFields(message.fields)
      setBanner(message.banner)
      setPending(false)
    }
  }

  const switchMode = (next: AuthMode) => {
    setFields({})
    setBanner(undefined)
    onModeChange(next)
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5" aria-label={registering ? 'Create an account' : 'Sign in'}>
      {registering && (
        <FormField label="Name" name="name" value={name} onChange={setName} autoComplete="name" error={fields.name} />
      )}
      <FormField
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
        error={fields.email}
      />
      <FormField
        label="Password"
        name="password"
        type="password"
        value={password}
        onChange={setPassword}
        autoComplete={registering ? 'new-password' : 'current-password'}
        hint={registering ? 'At least 10 characters.' : undefined}
        required
        error={fields.password}
      />
      {registering && (
        <FormField
          label="Confirm password"
          name="confirm"
          type="password"
          value={confirm}
          onChange={setConfirm}
          autoComplete="new-password"
          required
          error={fields.confirm}
        />
      )}

      {banner && (
        <div
          role="alert"
          className="rounded-field border border-[rgba(255,124,158,0.26)] bg-pink-bg px-4 py-3 text-[13.5px] leading-[1.5] text-pretty text-[#EBD3DC]"
        >
          {banner}
        </div>
      )}

      <button type="submit" disabled={pending} className={BUTTON_CLASSES}>
        {pending ? (registering ? 'Creating account…' : 'Signing in…') : registering ? 'Create account' : 'Sign in'}
      </button>

      {inlineToggle && (
        <p className="text-center text-[13.5px] text-muted-dim">
          {registering ? 'Already have an account? ' : 'New to AI Tool Kart? '}
          <button
            type="button"
            onClick={() => switchMode(registering ? 'login' : 'register')}
            className="cursor-pointer font-semibold text-accent hover:text-ink"
          >
            {registering ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      )}
    </form>
  )
}
