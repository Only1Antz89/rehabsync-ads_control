import { CalendarView } from './CalendarView';

export default function CalendarPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Calendar
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Scheduled and published posts by day.
        </p>
      </div>
      <CalendarView />
    </div>
  );
}
