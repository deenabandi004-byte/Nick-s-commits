/**
 * Edit-Rate Dashboard  Phase 7 admin surface.
 *
 * Calls GET /api/admin/edit-rate-dashboard and renders the A/B
 * comparison between the legacy `reply_generation` and the new
 * `email_generator` paths. Backend gates writes to ADMIN_UIDS; this
 * page is also gated behind VITE_EDIT_RATE_DASHBOARD_ENABLED so the
 * route 404s for everyone when the flag is off (default).
 *
 * Linear-clean, brand-blue accents, data-forward layout. This is an
 * internal admin tool, not a marketing surface  spend the design
 * budget on the user-facing CTA cards instead.
 */
import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { auth } from '@/lib/firebase';
import { API_BASE_URL } from '@/services/api';

const EDIT_RATE_DASHBOARD_ENABLED =
  import.meta.env.VITE_EDIT_RATE_DASHBOARD_ENABLED === 'true';

type BucketSummary = {
  drafts: number;
  edits: number;
  edit_rate: number;
  users: number;
};

type DashboardPayload = {
  old_generator: BucketSummary;
  new_generator: BucketSummary;
  new_unavailable: BucketSummary;
  rollout_pct: number;
  window_days: number;
  sample_size: {
    old_generator: number;
    new_generator: number;
    new_unavailable: number;
  };
};

const WINDOW_OPTIONS = [
  { value: '7', label: 'Last 7 days' },
  { value: '14', label: 'Last 14 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '60', label: 'Last 60 days' },
  { value: '90', label: 'Last 90 days' },
];

const EMPTY_BUCKET: BucketSummary = { drafts: 0, edits: 0, edit_rate: 0, users: 0 };

export default function EditRateDashboardPage() {
  if (!EDIT_RATE_DASHBOARD_ENABLED) {
    return <Navigate to="/find" replace />;
  }
  return <EditRateDashboardInner />;
}

function EditRateDashboardInner() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState('14');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const token = auth.currentUser ? await auth.currentUser.getIdToken() : null;
        if (!token) {
          throw new Error('Not signed in');
        }
        const res = await fetch(
          `${API_BASE_URL}/admin/edit-rate-dashboard?days=${encodeURIComponent(windowDays)}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (res.status === 403) {
          throw new Error('Admin access required');
        }
        if (!res.ok) {
          throw new Error(`Request failed (${res.status})`);
        }
        const payload = (await res.json()) as DashboardPayload;
        if (!cancelled) setData(payload);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [windowDays]);

  return (
    <div className="min-h-screen bg-background py-12 px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Edit-Rate Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A/B comparison of edit rate by generator version. Lower is better.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Select value={windowDays} onValueChange={setWindowDays}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Window" />
              </SelectTrigger>
              <SelectContent>
                {WINDOW_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setWindowDays((w) => `${w}`)}
              disabled={loading}
            >
              Refresh
            </Button>
          </div>
        </header>

        {loading && <Card className="p-8 text-center text-muted-foreground">Loading...</Card>}

        {error && (
          <Card className="p-6 border-destructive/40 bg-destructive/5 text-destructive">
            <div className="text-sm font-medium">Could not load dashboard</div>
            <div className="text-xs opacity-80 mt-1">{error}</div>
          </Card>
        )}

        {!loading && !error && data && <DashboardBody data={data} />}
      </div>
    </div>
  );
}

function DashboardBody({ data }: { data: DashboardPayload }) {
  const oldB = data.old_generator ?? EMPTY_BUCKET;
  const newB = data.new_generator ?? EMPTY_BUCKET;
  const fallbackB = data.new_unavailable ?? EMPTY_BUCKET;

  const totalNewBucketed = newB.drafts + fallbackB.drafts;
  const fallbackRate = totalNewBucketed > 0 ? fallbackB.drafts / totalNewBucketed : 0;
  const editRateDelta = oldB.drafts > 0 && newB.drafts > 0 ? newB.edit_rate - oldB.edit_rate : null;

  return (
    <>
      <div className="mb-8 flex items-center gap-3">
        <Badge variant="outline" className="font-mono">
          Rollout {data.rollout_pct}%
        </Badge>
        <Badge variant="outline" className="font-mono">
          Window {data.window_days}d
        </Badge>
        {editRateDelta !== null && (
          <Badge
            className={
              editRateDelta < 0
                ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100'
                : 'bg-amber-100 text-amber-700 hover:bg-amber-100'
            }
          >
            {editRateDelta < 0 ? 'New is editing less' : 'New is editing more'}
            {' '}({(editRateDelta * 100).toFixed(2)}pp)
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BucketCard
          title="Old generator"
          subtitle="reply_generation.batch_generate_emails"
          bucket={oldB}
          accent="border-l-4 border-l-slate-400"
        />
        <BucketCard
          title="New generator"
          subtitle="email_generator.generate_email"
          bucket={newB}
          accent="border-l-4 border-l-primary"
        />
      </div>

      {fallbackB.drafts > 0 && (
        <Card className="mt-6 p-6 border-amber-300/60 bg-amber-50/40">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-amber-900">New path fell back to old</div>
              <div className="text-xs text-amber-800/80 mt-1">
                Drafts where USE_NEW_GENERATOR was on but the new generator threw.
                {' '}{(fallbackRate * 100).toFixed(1)}% of new-bucket drafts.
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-semibold text-amber-900">{fallbackB.drafts}</div>
              <div className="text-xs text-amber-800/80">drafts</div>
            </div>
          </div>
        </Card>
      )}

      <p className="mt-8 text-xs text-muted-foreground">
        Bucketing prefers the per-event generatorVersion field. Events written before
        the dispatcher landed fall back to the user's current USE_NEW_GENERATOR
        assignment, which can be misleading for older windows.
      </p>
    </>
  );
}

function BucketCard({
  title,
  subtitle,
  bucket,
  accent,
}: {
  title: string;
  subtitle: string;
  bucket: BucketSummary;
  accent: string;
}) {
  return (
    <Card className={`p-6 ${accent}`}>
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-muted-foreground font-mono mt-0.5">{subtitle}</div>
      <div className="mt-6 grid grid-cols-2 gap-4">
        <Stat label="Edit rate" value={`${(bucket.edit_rate * 100).toFixed(1)}%`} />
        <Stat label="Drafts" value={bucket.drafts.toLocaleString()} />
        <Stat label="Edits" value={bucket.edits.toLocaleString()} />
        <Stat label="Users" value={bucket.users.toLocaleString()} />
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}
