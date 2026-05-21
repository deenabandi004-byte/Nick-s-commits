import { useState } from 'react';
import './BulletinBoard.css';
import DylanRobyPhoto from '@/assets/Dylan-Roby.jpeg';
import JacksonLeckPhoto from '@/assets/Jackson-Leck.jpeg';
import SarahUcuzogluPhoto from '@/assets/Sarah-Ucuzoglu.jpeg';
import DavidJiPhoto from '@/assets/David-Ji.jpeg';

type Note = {
  type: 'landed' | 'review';
  quote: string;
  name: string;
  role: string;
  tack: string;
  rotate: number;
  photo?: string;
};

// Notes with photos float to the front so the real headshots are always
// visible above the fold. The rest stay in their existing order.
const notes: Note[] = [
  { type: 'landed', quote: 'Offerloop does the work I spent hundreds of hours doing to land my internship - in minutes.', name: 'Dylan Roby', role: 'IB Analyst, Evercore', tack: 'tack-red', rotate: -1.2, photo: DylanRobyPhoto },
  { type: 'review', quote: 'I had so many recruiting tabs open. Now I have one. Everything I need in a single place.', name: 'Jackson Leck', role: 'PE Intern, Blackstone', tack: 'tack-blue', rotate: 0.8, photo: JacksonLeckPhoto },
  { type: 'landed', quote: 'As an international student, I had no pre-existing network, and Offerloop allowed me to find and connect with professionals that resulted in me landing an offer.', name: 'David Ji', role: 'Incoming FedEx Intern', tack: 'tack-yellow', rotate: 1.0, photo: DavidJiPhoto },
  { type: 'landed', quote: 'Automating cold outreach gave me more time spent face to face with professionals who could actually help.', name: 'Sarah Ucuzoglu', role: 'Advisory Intern, PwC', tack: 'tack-green', rotate: -0.5, photo: SarahUcuzogluPhoto },
  { type: 'landed', quote: 'Sent 12 emails in 10 minutes. Got 4 meetings. One turned into my summer offer.', name: 'Marcus T.', role: 'Incoming SA, Goldman Sachs', tack: 'tack-yellow', rotate: 1.4 },
  { type: 'review', quote: 'The meeting prep alone saved me hours. I walked into every call actually knowing what to say.', name: 'Priya S.', role: 'Finance Major, NYU', tack: 'tack-red', rotate: -1.0 },
  { type: 'landed', quote: 'Got my Deloitte offer after networking with 3 consultants I found through Offerloop in a single afternoon.', name: 'Jordan W.', role: 'Incoming Consultant, Deloitte', tack: 'tack-blue', rotate: 0.6 },
  { type: 'review', quote: 'I went from spending entire weekends writing emails to having my whole outreach done before Monday.', name: 'Alex M.', role: 'Consulting Recruit, Georgetown', tack: 'tack-green', rotate: 1.1 },
  { type: 'landed', quote: 'Used the hiring manager finder on a Lazard posting. Had a meeting within a week, offer by November.', name: 'Sophia K.', role: 'Incoming Analyst, Lazard', tack: 'tack-red', rotate: -1.5 },
  { type: 'review', quote: 'Finally a tool that understands what students actually need during recruiting season. This is it.', name: 'Emma L.', role: 'Econ Major, USC', tack: 'tack-yellow', rotate: 0.4 },
  { type: 'landed', quote: 'I landed 3 meetings in my first week. Before Offerloop I couldn\'t even find the right people to email.', name: 'Ryan C.', role: 'Incoming Analyst, Centerview', tack: 'tack-blue', rotate: -0.7 },
  { type: 'review', quote: 'The email tracking changed everything. I knew exactly when to follow up instead of guessing.', name: 'Nina P.', role: 'Business Major, Michigan', tack: 'tack-green', rotate: 1.3 },
];

const visibleCount = 6;

export default function BulletinBoard() {
  const [expanded, setExpanded] = useState(false);

  const visibleNotes = notes.slice(0, visibleCount);
  const hiddenNotes = notes.slice(visibleCount);

  const renderNote = (note: Note, idx: number) => (
    <div
      key={idx}
      className="bb-note"
      style={{ transform: `rotate(${note.rotate}deg)` }}
    >
      <div className={`bb-tack ${note.tack}`} />
      <div className={`bb-badge ${note.type === 'landed' ? 'landed' : 'review'}`}>
        <div className="bb-badge-dot" />
        {note.type === 'landed' ? 'Offer landed' : 'Student review'}
      </div>
      <p className="bb-quote">"{note.quote}"</p>
      <div className="bb-author-row">
        {note.photo && (
          <img src={note.photo} alt={note.name} className="bb-avatar" />
        )}
        <div>
          <div className="bb-author">{note.name}</div>
          <div className="bb-role">{note.role}</div>
        </div>
      </div>
    </div>
  );

  return (
    <section className="bb-section">
      <div className="bb-grid">
        {visibleNotes.map(renderNote)}
      </div>

      <div className={`bb-expand-wrap${expanded ? ' open' : ''}`}>
        <div className="bb-grid" style={{ paddingTop: 20 }}>
          {hiddenNotes.map((note, i) => renderNote(note, i + visibleCount))}
        </div>
      </div>

      <button
        className="bb-toggle"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Show less' : `Show ${hiddenNotes.length} more`}
        <span className={`bb-toggle-arrow${expanded ? ' open' : ''}`}>▼</span>
      </button>
    </section>
  );
}
