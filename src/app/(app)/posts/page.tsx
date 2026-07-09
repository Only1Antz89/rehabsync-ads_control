import { PostsList } from './PostsList';

export default function PostsPage() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
          Posts
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          Every post with its per-platform status — publish, retry, and work the manual-export checklist.
        </p>
      </div>
      <PostsList />
    </div>
  );
}
