import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { formatDay, groupByDate } from '../lib/format.js';

export function StatusBadge({ status, versionCount }) {
  if (status === 'locked') {
    return <span className="badge badge-locked"><Lock size={12} aria-hidden="true" /> Verrouillée</span>;
  }
  return (
    <span className="badge badge-draft">
      Brouillon{versionCount > 0 ? `, ${versionCount} version${versionCount > 1 ? 's' : ''}` : ''}
    </span>
  );
}

export default function EntryList({ entries, showProject = true }) {
  return (
    <div className="entry-groups">
      {groupByDate(entries).map((group) => (
        <section key={group.date} className="entry-group">
          <h2 className="entry-group-date">
            <time dateTime={group.date}>{formatDay(group.date)}</time>
          </h2>
          <ul className="entry-list">
            {group.entries.map((e) => (
              <li key={e.id}>
                <Link to={`/entries/${e.id}`} className="entry-row">
                  <span className="entry-row-main">
                    <span className="entry-row-title">{e.title}</span>
                    {e.excerpt && <span className="entry-row-excerpt">{e.excerpt}</span>}
                  </span>
                  <span className="entry-row-meta">
                    {showProject && (
                      <span className="project-tag">
                        <span className="project-dot" style={{ background: e.project_color }} aria-hidden="true" />
                        {e.project_name}
                      </span>
                    )}
                    <StatusBadge status={e.status} versionCount={e.version_count} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
