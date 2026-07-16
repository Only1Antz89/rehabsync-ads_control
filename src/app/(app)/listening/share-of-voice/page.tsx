import { ShareOfVoice } from './ShareOfVoice';

export const dynamic = 'force-dynamic';

export default function ShareOfVoicePage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Share of voice
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Compare how often your brand is mentioned versus competitors across everything social
          listening picks up.
        </p>
      </div>
      <ShareOfVoice />
    </div>
  );
}
