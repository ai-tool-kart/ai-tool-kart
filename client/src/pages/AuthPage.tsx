import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import AuthForm, { type AuthMode } from '@/components/auth/AuthForm'
import { AccountMessage } from '@/components/auth/RequireAuth'
import SpotCard from '@/components/ui/SpotCard'
import { useAuth } from '@/hooks/useAuth'
import { useDocumentMeta } from '@/hooks/useDocumentMeta'
import { accountHead, safeNextPath } from '@/utils/submissionStatus'

/*
 * /login and /register — one page, two modes. After success the browser goes
 * to ?next= (same-site paths only), defaulting to My submissions.
 *
 * Account pages are not for search engines: noindex.
 */

const COPY: Record<AuthMode, { eyebrow: string; title: string; lede: string }> = {
  login: { eyebrow: 'Account', title: 'Sign in', lede: 'Sign in to submit tools and follow their review.' },
  register: {
    eyebrow: 'Account',
    title: 'Create your account',
    lede: 'An account keeps your submissions together so you can follow each one through review.',
  },
}

export default function AuthPage({ mode }: { mode: AuthMode }) {
  const { state } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNextPath(params.get('next'))
  const copy = COPY[mode]

  useDocumentMeta(accountHead(copy.title, copy.lede))

  if (state.status === 'authenticated') return <Navigate to={next} replace />

  const query = params.get('next') ? `?next=${encodeURIComponent(next)}` : ''

  return (
    <section className="relative mx-auto max-w-site px-8 pt-16 pb-[88px]">
      <div className="mx-auto max-w-[460px]">
        <p className="text-[11.5px] tracking-[0.2em] text-accent uppercase">{copy.eyebrow}</p>
        <h1 className="mt-3 text-[clamp(30px,4vw,40px)] font-bold tracking-[-0.04em] text-ink">{copy.title}</h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-muted-dim">{copy.lede}</p>

        {state.status === 'unavailable' ? (
          <AccountMessage title="Accounts are unavailable">Please try again later.</AccountMessage>
        ) : (
          <SpotCard className="mt-8 rounded-panel p-7 sm:p-8">
            <div className="relative">
              <AuthForm
                key={mode}
                mode={mode}
                inlineToggle={false}
                onModeChange={() => {}}
                onSuccess={() => navigate(next, { replace: true })}
              />
              <p className="mt-5 text-center text-[13.5px] text-muted-dim">
                {mode === 'login' ? 'New to AI Tool Kart? ' : 'Already have an account? '}
                <Link
                  to={`${mode === 'login' ? '/register' : '/login'}${query}`}
                  className="font-semibold text-accent hover:text-ink"
                >
                  {mode === 'login' ? 'Create an account' : 'Sign in'}
                </Link>
              </p>
            </div>
          </SpotCard>
        )}
      </div>
    </section>
  )
}
